
let selected = null;
const root = document
    .getElementById("ppt-extension-root")
    .shadowRoot;

const byId = id => root.getElementById(id);

async function search(q) {

    const res = await fetch(
        "https://red.parsianbroker.com/api/PublicMessages/SearchInstruments?filter=" + q
    );

    const json = await res.json();

    return json?.response?.data || [];
}

async function send(side) {

    const log = byId("log");

    try {

        const price = +byId("price").value;
        const qty = +byId("qty").value;

        const auth = JSON.parse(localStorage.getItem("auth"));

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
            "https://red.parsianbroker.com/api/Orders/OrderEntry",
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
            .forEach(x => x.classList.remove("active"));

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

        current.style.display =
            current.style.display === "none"
                ? "block"
                : "none";
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

function playAlarm() {

    const audio = new Audio(
        "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
    );

    audio.play();
}

function checkOptionCondition(
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

    byId("spread-value").innerText = spread;

    byId("return-value").innerText = buyReturn.toFixed(4);

    if (buyReturn > expected) {

        playAlarm();
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



byId("opt-start").onclick = () => {

    clearInterval(optionTimer);

    setMonitoringState(true);

    optionTimer = setInterval(() => {

        const ask = getAskA();
        const bid = getBidB();

        if (!ask || !bid)
            return;

        checkOptionCondition(
            ask,
            bid
        );

    }, 1000);
};

byId("opt-stop")
    .onclick = () => {

        clearInterval(optionTimer);
        setMonitoringState(false);

    };

function getAskA() {

    const el =document.querySelector('#option-instrument-focus-target-IRO9BMLT0J11 client-instrument-price-position-row[orderside="Sell"] .-is-price .-is-clickable');

    return Number(el?.innerText.replace(/,/g, "").trim());
}

function getBidB() {

    const el =
        document.querySelector(
            '#option-instrument-focus-target-IRO9BMLT0J21 client-instrument-price-position-row[orderside="Buy"] .-is-price .-is-clickable'
        );

    return Number(
        el?.innerText
            .replace(/,/g, "")
            .trim()
    );
}

function setMonitoringState(running) {

    const startBtn = byId("opt-start");
    const stopBtn = byId("opt-stop");
    const status = byId("monitor-status");

    if (running) {

        startBtn.disabled = true;
        stopBtn.disabled = false;

        status.innerText = "🟢 در حال مانیتورینگ";

        status.classList.remove("stopped");
        status.classList.add("running");

    } else {

        startBtn.disabled = false;
        stopBtn.disabled = true;

        status.innerText = "⏹ متوقف";

        status.classList.remove("running");
        status.classList.add("stopped");
    }
}
/*---------------------------------------------------------------------*/
