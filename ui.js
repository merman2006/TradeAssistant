
let selected = null;
const brokerConfig = window.PPT_BROKER_CONFIG;

if (!brokerConfig) {
    throw new Error("Broker configuration was not loaded.");
}

const brokerApiUrl = endpoint =>
    new URL(endpoint, brokerConfig.apiBaseUrl).toString();

const getBrokerAuth = () =>
    JSON.parse(localStorage.getItem(brokerConfig.authStorageKey));
const root = document
    .getElementById("ppt-extension-root")
    .shadowRoot;

const byId = id => root.getElementById(id);

async function search(q) {

    const res = await fetch(
        brokerApiUrl(
            brokerConfig.endpoints.searchInstruments +
            "?filter=" + encodeURIComponent(q)
        )
    );

    const json = await res.json();

    return json?.response?.data || [];
}

async function send(side) {

    const log = byId("log");

    try {

        const price = +byId("price").value;
        const qty = +byId("qty").value;

        const auth = getBrokerAuth();

        const payload = {
            PrincipalId: null,
            InstrumentId: selected.instrumentId,
            ISensOM: side,
            YValiOmNSC: "Day",
            PLimSaiOM: price,
            QTitTotOM: qty,
            QTitDvlOM: 0,
            extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
            ExecutionType: "Instant"
        };

        const res = await fetch(
            brokerApiUrl(brokerConfig.endpoints.orderEntry),
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "content-type": "application/json",
                    "authorization": auth
                },
                body: JSON.stringify(payload)
            }
        );

        log.innerText = JSON.stringify(await res.json(), null, 2);

    } catch (e) {
        log.innerText = e.message;
    }
}

function bind() {

    byId("searchBtn").onclick = async () => {

        const q = byId("search").value;

        const results = await search(q);

        const box = byId("results");

        box.innerHTML = "";

        results.forEach(r => {

            const div = document.createElement("div");
            div.innerText = r.title.replace('<b>', '').replace('</b>', '');

            div.onclick = () => {
                selected = r;
                byId("selected").innerText = r.title.replace('<b>', '').replace('</b>', '');
                box.innerHTML = "";
            };

            box.appendChild(div);
        });
    };

    byId("buy").onclick = () => send("Buy");
    byId("sell").onclick = () => send("Sell");
}

bind();


// ---------- Tabs ----------

root.querySelectorAll(".ppt-tab").forEach(tab => {

    tab.onclick = () => {

        root
            .querySelectorAll(".ppt-tab")
            .forEach(x => x.classList.remove("active"));

        root
            .querySelectorAll(".ppt-content")
            .forEach(x => {
                x.classList.remove("active");
                x.classList.remove("minimized");
            });

        tab.classList.add("active");

        const target =
            tab.dataset.tab === "stock"
                ? "ppt-stock"
                : "ppt-option";

        byId(target)
            .classList.add("active");
    };
});

// ---------- Minimize ----------

byId("ppt-minimize")
    .onclick = () => {

        const current =
            root.querySelector(".ppt-content.active");

        if (!current) return;

        current.classList.toggle("minimized");
    };


// ---------- Drag Window ----------

(() => {

    const panel =
        byId("ppt-panel");

    const header =
        byId("ppt-header");

    let dragging = false;

    let startX = 0;
    let startY = 0;

    let startLeft = 0;
    let startTop = 0;

    header.addEventListener("mousedown", e => {

        dragging = true;

        startX = e.clientX;
        startY = e.clientY;

        startLeft = panel.offsetLeft;
        startTop = panel.offsetTop;
    });

    document.addEventListener("mousemove", e => {

        if (!dragging) return;

        panel.style.left =
            startLeft + (e.clientX - startX) + "px";

        panel.style.top =
            startTop + (e.clientY - startY) + "px";
    });

    document.addEventListener("mouseup", () => {

        dragging = false;
    });

})();


/*-------------------------------معاملات مشتقه----------------------*/
let optionTimer = null;
let optionSymbolsSignature = null;

const OPTION_INSTRUMENT_ID_PREFIX = "option-instrument-focus-target-";

function getOptionSymbols() {

    return Array
        .from(document.querySelectorAll(
            `#sc-optionInstrumentFavoriteList > li[id^="${OPTION_INSTRUMENT_ID_PREFIX}"]`
        ))
        .map(item => {

            const instrumentId =
                item.id.slice(OPTION_INSTRUMENT_ID_PREFIX.length);

            const header =
                item.querySelector(
                    "client-option-instruments-favorites-item-header main"
                );

            const symbol =
                header?.querySelector("label")?.innerText.trim();

            const description =
                header?.querySelector("span")?.innerText.trim();

            return {
                instrumentId,
                title: [symbol, description]
                    .filter(Boolean)
                    .join(" - ")
            };
        })
        .filter(item => item.instrumentId && item.title);
}

function fillOptionSymbolSelect(select, symbols, previousValue, defaultIndex) {

    select.innerHTML = "";

    symbols.forEach(symbol => {

        const option = document.createElement("option");
        option.value = symbol.instrumentId;
        option.innerText = symbol.title;
        select.appendChild(option);
    });

    if (symbols.some(symbol => symbol.instrumentId === previousValue)) {
        select.value = previousValue;
    } else if (symbols[defaultIndex]) {
        select.value = symbols[defaultIndex].instrumentId;
    }
}

function refreshOptionSymbols() {

    const symbols = getOptionSymbols();
    const signature = symbols
        .map(symbol => `${symbol.instrumentId}:${symbol.title}`)
        .join("|");

    if (signature === optionSymbolsSignature)
        return;

    optionSymbolsSignature = signature;

    const symbolA = byId("opt-symbol-a");
    const symbolB = byId("opt-symbol-b");
    const status = byId("option-symbols-status");

    const selectedA = symbolA.value;
    const selectedB = symbolB.value;

    fillOptionSymbolSelect(symbolA, symbols, selectedA, 0);
    fillOptionSymbolSelect(symbolB, symbols, selectedB, 1);

    if (symbols.length) {
        status.innerText = "";
    } else {
        symbolA.innerHTML = '<option value="">نمادی در صفحه پیدا نشد</option>';
        symbolB.innerHTML = '<option value="">نمادی در صفحه پیدا نشد</option>';
        status.innerText = "ابتدا قراردادهای موردنظر را به لیست نمادهای صفحه اضافه کنید.";
    }
}

function getSelectedOptionContainer(selectId) {

    const instrumentId = byId(selectId).value;

    if (!instrumentId)
        return null;

    return document.getElementById(
        OPTION_INSTRUMENT_ID_PREFIX + instrumentId
    );
}

async function isOptionBuyOrderExecuted(orderInfo) {

    // TODO: بعداً با API سفارش‌ها، انجام واقعی خرید نماد A بررسی شود.
    console.log("Waiting before sending option B sell order", orderInfo);

    await new Promise(resolve => setTimeout(resolve, 1000));

    return true;
}

async function sendOptionBuyOrder() {

    const button = byId("opt-buy-order");
    const status = byId("option-symbols-status");
    const instrumentIdA = byId("opt-symbol-a").value;
    const instrumentIdB = byId("opt-symbol-b").value;
    const askA = getAskA();
    const quantity = +byId("opt-buy-quantity").value;

    status.classList.remove("success");

    if (!instrumentIdA) {
        status.innerText = "نماد A را انتخاب کنید.";
        return;
    }

    if (!instrumentIdB) {
        status.innerText = "نماد B را انتخاب کنید.";
        return;
    }

    if (!askA) {
        status.innerText = "قیمت سرخط فروش نماد A پیدا نشد.";
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        status.innerText = "تعداد خرید را به‌صورت عدد صحیح و بزرگ‌تر از صفر وارد کنید.";
        return;
    }

    try {

        button.disabled = true;
        button.innerText = "در حال ثبت خرید...";
        status.innerText = "";

        const auth = getBrokerAuth();

        const payload = {
            PrincipalId: null,
            InstrumentId: instrumentIdA,
            ISensOM: "Buy",
            YValiOmNSC: "Day",
            PLimSaiOM: askA,
            QTitTotOM: quantity,
            QTitDvlOM: 0,
            extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
            ExecutionType: "Instant"
        };

        const response = await fetch(
            brokerApiUrl(brokerConfig.endpoints.orderEntry),
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "content-type": "application/json",
                    "authorization": auth
                },
                body: JSON.stringify(payload)
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result?.message ||
                result?.response?.message ||
                "ثبت سفارش خرید ناموفق بود."
            );
        }

        status.innerText = "در حال بررسی انجام شدن خرید نماد A...";

        const buyExecuted = await isOptionBuyOrderExecuted({
            instrumentId: instrumentIdA,
            price: askA,
            quantity,
            orderResponse: result
        });

        if (!buyExecuted) {
            status.innerText =
                "سفارش خرید A ثبت شد؛ بررسی انجام معامله هنوز پیاده‌سازی نشده و فروش B ارسال نشد.";
            return;
        }

        const bidB = getBidB();

        if (!bidB) {
            throw new Error("قیمت سرخط خرید نماد B پیدا نشد.");
        }

        button.innerText = "در حال ثبت فروش B...";

        const sellPayload = {
            PrincipalId: null,
            InstrumentId: instrumentIdB,
            ISensOM: "Sell",
            YValiOmNSC: "Day",
            PLimSaiOM: bidB,
            QTitTotOM: quantity,
            QTitDvlOM: 0,
            extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
            ExecutionType: "Instant"
        };

        const sellResponse = await fetch(
            brokerApiUrl(brokerConfig.endpoints.orderEntry),
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "content-type": "application/json",
                    "authorization": auth
                },
                body: JSON.stringify(sellPayload)
            }
        );

        const sellResult = await sellResponse.json();

        if (!sellResponse.ok) {
            throw new Error(
                sellResult?.message ||
                sellResult?.response?.message ||
                "ثبت سفارش فروش نماد B ناموفق بود."
            );
        }

        status.innerText =
            `خرید A با قیمت ${askA} و فروش B با قیمت ${bidB} ثبت شد.`;
        console.log(
            `خرید A و فروش B، هر کدام به تعداد ${quantity} ثبت شدند.`
        );
        status.classList.add("success");

    } catch (error) {

        status.innerText = error.message;
        status.classList.remove("success");

    } finally {

        button.disabled = false;
        button.innerText = "خرید";
    }
}

function playAlarm() {

    const audio = new Audio(
        "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
    );

    audio.play();
}

function checkBuyCondition(
    ask,
    bid
) {
    byId("ppt-status-buy-alarm").classList.remove("show");

    const maxValue = +byId("opt-max-value").value;

    const expected = +byId("opt-expected-return").value;

    const spread = ask - bid;

    if (spread <= 0)
        return;

    const buyReturn = ((maxValue / spread) - 1) * 100;

    byId("ask-value").innerText = ask;

    byId("bid-value").innerText = bid;

    byId("buy-spread-value").innerText = spread;

    byId("buy-return-value").innerText = buyReturn.toFixed(2);

    if (buyReturn > expected) {

        //playAlarm();
        byId("ppt-status-buy-alarm").classList.add("show");
        //const ok = confirm("شرط معامله برقرار شد\n\n" +"BuyReturn = " +buyReturn.toFixed(4));

        //if (ok) {

        //    console.log(
        //        "در فاز بعدی خرید/فروش اجرا می‌شود"
        //    );
        //}

        //clearInterval(optionTimer);
    }
}

function checkSellCondition(
    bidA,
    askB
) {
    byId("ppt-status-sell-alarm").classList.remove("show");

    const premium = +byId("opt-premium").value;
    const expectedOffsetReturn =
        +byId("opt-expected-offset-return").value;

    const spread = bidA - askB;

    byId("sell-bid-a-value").innerText = bidA;
    byId("sell-ask-b-value").innerText = askB;
    byId("sell-spread-value").innerText = spread;

    if (premium <= 0)
        return;

    const sellReturn = ((spread / premium) - 1) * 100;

    byId("sell-return-value").innerText = sellReturn.toFixed(2);

    if (sellReturn > expectedOffsetReturn) {

        playAlarm();
        byId("ppt-status-sell-alarm").classList.add("show");
    }
}



byId("opt-start").onclick = () => {

    clearInterval(optionTimer);

    refreshOptionSymbols();

    if (!byId("opt-symbol-a").value || !byId("opt-symbol-b").value) {
        byId("option-symbols-status").innerText =
            "برای شروع مانیتورینگ، نماد A و نماد B را انتخاب کنید.";
        setMonitoringState(false);
        return;
    }

    setMonitoringState(true);

    optionTimer = setInterval(() => {

        const ask = getAskA();
        const bid = getBidB();
        const bidA = getBidA();
        const askB = getAskB();

        if (ask && bid) {
            checkBuyCondition(
                ask,
                bid
            );
        }

        if (bidA && askB) {
            checkSellCondition(
                bidA,
                askB
            );
        }

    }, 1000);
};

byId("opt-stop")
    .onclick = () => {

        clearInterval(optionTimer);
        setMonitoringState(false);

    };

byId("opt-buy-order").onclick = sendOptionBuyOrder;

function getAskA() {

    const container = getSelectedOptionContainer("opt-symbol-a");
    const el = container?.querySelector(
        'client-instrument-price-position-row[orderside="Sell"] .-is-price .-is-clickable'
    );

    return Number(el?.innerText.replace(/,/g, "").trim());
}

function getBidB() {

    const container = getSelectedOptionContainer("opt-symbol-b");
    const el = container?.querySelector(
        'client-instrument-price-position-row[orderside="Buy"] .-is-price .-is-clickable'
    );

    return Number(
        el?.innerText
            .replace(/,/g, "")
            .trim()
    );
}

function getBidA() {

    const container = getSelectedOptionContainer("opt-symbol-a");
    const el = container?.querySelector(
        'client-instrument-price-position-row[orderside="Buy"] .-is-price .-is-clickable'
    );

    return Number(el?.innerText.replace(/,/g, "").trim());
}

function getAskB() {

    const container = getSelectedOptionContainer("opt-symbol-b");
    const el = container?.querySelector(
        'client-instrument-price-position-row[orderside="Sell"] .-is-price .-is-clickable'
    );

    return Number(el?.innerText.replace(/,/g, "").trim());
}

function setMonitoringState(running) {

    const startBtn = byId("opt-start");
    const stopBtn = byId("opt-stop");

    if (running) {

        startBtn.disabled = true;
        stopBtn.disabled = false;
        startBtn.innerText = "🟢 در حال مانیتورینگ...";
        startBtn.classList.add("monitoring");

    } else {

        startBtn.disabled = false;
        stopBtn.disabled = true;
        startBtn.innerText = "شروع مانیتورینگ";
        startBtn.classList.remove("monitoring");
    }
}

refreshOptionSymbols();
setInterval(refreshOptionSymbols, 2000);
/*---------------------------------------------------------------------*/
