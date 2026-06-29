
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
const DERIVATIVE_MAIN_HOSTS = [
    "khobregan.tsetab.ir",
    "khobregan-red.tsetab.ir"
];
const DERIVATIVE_MAIN_HASH = "#/stock/derivative/main";
let derivativePanelManualOverride = false;

function isDerivativeMainPage() {

    return DERIVATIVE_MAIN_HOSTS.includes(window.location.hostname) &&
        window.location.hash
            .split("?")[0]
            .startsWith(DERIVATIVE_MAIN_HASH);
}

function syncDerivativeTabVisibility() {

    const optionTab = byId("ppt-option");

    if (!optionTab)
        return;

    optionTab.classList.toggle(
        "minimized",
        !isDerivativeMainPage() && !derivativePanelManualOverride
    );
}

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
        derivativePanelManualOverride =
            current.id === "ppt-option" &&
            !current.classList.contains("minimized");
    };

window.addEventListener(
    "hashchange",
    syncDerivativeTabVisibility
);

window.addEventListener(
    "popstate",
    syncDerivativeTabVisibility
);

syncDerivativeTabVisibility();


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
let optionStrategiesSignature = null;
let optionStrategiesRequest = null;
let optionStrategySymbolsSignature = null;
let optionExecutionStopRequested = false;

const OPTION_INSTRUMENT_ID_PREFIX = "option-instrument-focus-target-";
const OPTION_STRATEGY_SELECTORS = [
    'ng-select[formcontrolname="buyOptionStrategyUniqueKey"]',
    ".-is-strategyDropdown"
];
const OPTION_STRATEGY_KEY_PATTERN = /\b\d+-\d+-[A-Z0-9]+-[A-Z0-9]+\b/i;
const OPTION_STRATEGY_NOT_FOUND_VALUE = "__ppt_strategy_not_found__";
const OPTION_STRATEGY_TYPE_LABELS = {
    ShortStraddle: "SSD",
    ShortStrangle: "SSG",
    BullCallSpread: "BUCS",
    BearCallSpread: "BECS",
    BullPutSpread: "BUPS",
    BearPutSpread: "BEPS"
};

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

function findStrategyKey(value) {

    return value?.match(OPTION_STRATEGY_KEY_PATTERN)?.[0] || "";
}

function getOptionStrategyTypeLabel(type) {

    return OPTION_STRATEGY_TYPE_LABELS[type] ||
        String(type || "")
            .replace(/([a-z])([A-Z])/g, "$1$2")
            .replace(/[a-z]/g, "")
            .slice(0, 4) ||
        "???";
}

function getOptionStrategyTitle(strategy) {

    if (strategy.title)
        return strategy.title;

    return [
        getOptionStrategyTypeLabel(strategy.type),
        strategy.baseStrategyInstrumentName,
        strategy.strategyInstrumentName,
        strategy.thirdStrategyInstrumentName,
        Number(strategy.quantity || 0).toLocaleString("en-US", {
            maximumFractionDigits: 0
        })
    ]
        .filter(Boolean)
        .join("-");
}

function getResponseData(json) {

    return json?.response?.data ||
        json?.result?.data ||
        json?.data ||
        json?.response ||
        json?.result ||
        json ||
        [];
}

function getResponseErrorMessage(result, fallbackMessage) {

    const errors = result?.response?.errors ||
        result?.errors ||
        [];

    const errorMessage = Array
        .from(Array.isArray(errors) ? errors : [errors])
        .map(error => error?.message || error)
        .filter(Boolean)
        .join("، ");

    const message =
        errorMessage ||
        result?.message ||
        result?.response?.message ||
        fallbackMessage;

    return message === fallbackMessage
        ? fallbackMessage
        : `${fallbackMessage} ${message}`;
}

async function fetchOptionStrategies() {

    const auth = getBrokerAuth();
    const response = await fetch(
        brokerApiUrl(brokerConfig.endpoints.optionStrategies),
        {
            method: "GET",
            credentials: "include",
            headers: {
                "content-type": "application/json",
                "authorization": auth
            }
        }
    );

    const json = await response.json();

    if (!response.ok) {
        throw new Error(
            json?.message ||
            json?.response?.message ||
            "دریافت استراتژی‌ها ناموفق بود."
        );
    }

    const data = getResponseData(json);

    return (Array.isArray(data) ? data : [])
        .map(strategy => ({
            label: normalizeOptionStrategyLabel(
                getOptionStrategyTitle(strategy)
            ),
            key: strategy.uniqueKey,
            baseInstrumentId: strategy.baseStrategyInstrumentId,
            strategyInstrumentId: strategy.strategyInstrumentId,
            thirdInstrumentId: strategy.thirdStrategyInstrumentId
        }))
        .filter(strategy => strategy.label && strategy.key);
}

function getStrategyKeyFromElement(element) {

    const directKey = findStrategyKey(element?.innerText);

    if (directKey)
        return directKey;

    let current = element;

    while (current && current !== document.body) {

        for (const attribute of Array.from(current.attributes || [])) {

            const key = findStrategyKey(attribute.value);

            if (key)
                return key;
        }

        if (current.matches?.("ng-select")) {
            break;
        }

        current = current.parentElement;
    }

    return "";
}

function normalizeOptionStrategyLabel(label) {

    return String(label || "")
        .replace(/\s+/g, " ")
        .trim();
}

function getOptionStrategyIdentity(strategy) {

    const key = strategy.key || "";
    const label = normalizeOptionStrategyLabel(strategy.label);

    return {
        key,
        label
    };
}

function distinctOptionStrategies(strategies) {

    return strategies.filter((strategy, index, allStrategies) => {

        const current = getOptionStrategyIdentity(strategy);

        return allStrategies.findIndex(item => {

            const candidate = getOptionStrategyIdentity(item);

            return (!!current.key && current.key === candidate.key) ||
                (!!current.label && current.label === candidate.label);
        }) === index;
    });
}

function getOptionStrategies() {

    const strategySelector = OPTION_STRATEGY_SELECTORS
        .flatMap(selector => [
            `${selector} .ng-option-label`,
            `${selector} .ng-value-label`
        ])
        .join(", ");

    const strategyLabels = document.querySelectorAll(
        strategySelector
    );

    const strategies = Array
        .from(strategyLabels)
        .map(item => ({
            label: normalizeOptionStrategyLabel(item.innerText),
            key: getStrategyKeyFromElement(item)
        }))
        .filter(strategy => strategy.label);

    return distinctOptionStrategies(strategies);
}

function getOptionStrategyMatchScore(strategy, instrumentIdA, instrumentIdB) {

    if (!instrumentIdA || !instrumentIdB)
        return 0;

    if (
        strategy.baseInstrumentId === instrumentIdA &&
        strategy.strategyInstrumentId === instrumentIdB
    ) {
        return 100;
    }

    if (
        strategy.baseInstrumentId === instrumentIdB &&
        strategy.strategyInstrumentId === instrumentIdA
    ) {
        return 80;
    }

    const strategyInstrumentIds = [
        strategy.baseInstrumentId,
        strategy.strategyInstrumentId,
        strategy.thirdInstrumentId
    ].filter(Boolean);

    if (
        strategyInstrumentIds.includes(instrumentIdA) &&
        strategyInstrumentIds.includes(instrumentIdB)
    ) {
        return 50;
    }

    return 0;
}

function selectMissingOptionStrategy(select, label) {

    Array
        .from(select.options)
        .filter(option => option.value === OPTION_STRATEGY_NOT_FOUND_VALUE)
        .forEach(option => option.remove());

    const option = document.createElement("option");

    option.value = OPTION_STRATEGY_NOT_FOUND_VALUE;
    option.innerText = label;
    select.insertBefore(option, select.firstChild);
    select.value = OPTION_STRATEGY_NOT_FOUND_VALUE;
}

function autoSelectOptionStrategy(select, strategies, instrumentIdA, instrumentIdB) {

    const symbolsSignature = `${instrumentIdA || ""}|${instrumentIdB || ""}`;
    const symbolsChanged =
        symbolsSignature !== optionStrategySymbolsSignature;

    optionStrategySymbolsSignature = symbolsSignature;

    if (!instrumentIdA || !instrumentIdB) {
        return;
    }

    const currentOption = select.selectedOptions[0];
    const currentStrategy = strategies.find(strategy =>
        strategy.key && strategy.key === currentOption?.dataset.strategyKey
    );

    if (
        !symbolsChanged &&
        getOptionStrategyMatchScore(currentStrategy || {}, instrumentIdA, instrumentIdB)
    ) {
        return;
    }

    const matchedStrategy = strategies
        .map(strategy => ({
            strategy,
            score: getOptionStrategyMatchScore(
                strategy,
                instrumentIdA,
                instrumentIdB
            )
        }))
        .filter(item => item.score > 0)
        .sort((first, second) => second.score - first.score)[0]?.strategy;

    if (matchedStrategy) {
        select.value = matchedStrategy.key || matchedStrategy.label;
        return;
    }

    selectMissingOptionStrategy(
        select,
        "استراتژی مناسب پیدا نشد"
    );
}

async function refreshOptionStrategies() {

    const select = byId("opt-strategy");
    const cachedStrategies = Array
        .from(select.options)
        .filter(option => option.value)
        .filter(option => option.value !== OPTION_STRATEGY_NOT_FOUND_VALUE)
        .map(option => ({
            label: normalizeOptionStrategyLabel(option.innerText),
            key: option.dataset.strategyKey || findStrategyKey(option.value),
            baseInstrumentId: option.dataset.baseInstrumentId,
            strategyInstrumentId: option.dataset.strategyInstrumentId,
            thirdInstrumentId: option.dataset.thirdInstrumentId
        }))
        .filter(strategy => strategy.label);

    let fetchedStrategies = [];

    try {

        optionStrategiesRequest =
            optionStrategiesRequest || fetchOptionStrategies();

        fetchedStrategies = await optionStrategiesRequest;

    } catch (error) {

        console.warn("Could not fetch option strategies", error);
        optionStrategiesRequest = null;
    }

    const selectedInstrumentIds = [
        byId("opt-symbol-a").value,
        byId("opt-symbol-b").value
    ].filter(Boolean);
    const selectedSymbolsSignature = selectedInstrumentIds.join("|");

    const visibleFetchedStrategies = fetchedStrategies.filter(strategy =>
        !selectedInstrumentIds.length ||
        selectedInstrumentIds.includes(strategy.baseInstrumentId) ||
        selectedInstrumentIds.includes(strategy.strategyInstrumentId) ||
        selectedInstrumentIds.includes(strategy.thirdInstrumentId)
    );

    const strategies = distinctOptionStrategies([
        ...visibleFetchedStrategies,
        ...getOptionStrategies(),
        ...cachedStrategies
    ]);

    const signature = strategies
        .map(strategy => `${strategy.key}:${strategy.label}`)
        .join("|") + `::${selectedSymbolsSignature}`;

    if (signature === optionStrategiesSignature)
        return;

    optionStrategiesSignature = signature;

    const selectedStrategy = select.value;
    const selectedStrategyLabel =
        normalizeOptionStrategyLabel(
            select.selectedOptions[0]?.innerText
        );

    select.innerHTML = "";

    if (!strategies.length) {
        selectMissingOptionStrategy(
            select,
            "استراتژی مناسب پیدا نشد"
        );
        return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.innerText = "انتخاب دستی استراتژی";
    select.appendChild(placeholder);

    strategies.forEach(strategy => {

        const option = document.createElement("option");
        option.value = strategy.key || strategy.label;
        option.innerText = strategy.label;

        if (strategy.key) {
            option.dataset.strategyKey = strategy.key;
        }

        if (strategy.baseInstrumentId) {
            option.dataset.baseInstrumentId = strategy.baseInstrumentId;
        }

        if (strategy.strategyInstrumentId) {
            option.dataset.strategyInstrumentId = strategy.strategyInstrumentId;
        }

        if (strategy.thirdInstrumentId) {
            option.dataset.thirdInstrumentId = strategy.thirdInstrumentId;
        }

        select.appendChild(option);
    });

    if (Array.from(select.options).some(option =>
        option.value === selectedStrategy
    )) {
        select.value = selectedStrategy;
    } else if (selectedStrategyLabel) {
        const matchingOption = Array
            .from(select.options)
            .find(option =>
                normalizeOptionStrategyLabel(option.innerText) ===
                selectedStrategyLabel
            );

        if (matchingOption) {
            select.value = matchingOption.value;
        }
    }

    autoSelectOptionStrategy(
        select,
        strategies,
        byId("opt-symbol-a").value,
        byId("opt-symbol-b").value
    );
}

function getSelectedOptionStrategyKey() {

    const strategy = byId("opt-strategy");
    const selectedOption = strategy.selectedOptions[0];

    return selectedOption?.dataset.strategyKey ||
        findStrategyKey(strategy.value);
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

function getBuyConditionState(ask, bid) {

    const maxValue = +byId("opt-max-value").value;
    const expected = +byId("opt-expected-return").value;
    const spread = ask - bid;

    if (spread <= 0) {
        return {
            spread,
            buyReturn: null,
            isHit: false
        };
    }

    const buyReturn = ((maxValue / spread) - 1) * 100;

    return {
        spread,
        buyReturn,
        isHit: buyReturn > expected
    };
}

async function sendOptionBuyOrder() {

    await refreshOptionStrategies();

    const button = byId("opt-buy-order");
    const stopButton = byId("opt-stop-execution");
    const progress = byId("opt-execution-progress");
    const status = byId("option-symbols-status");
    const instrumentIdA = byId("opt-symbol-a").value;
    const instrumentIdB = byId("opt-symbol-b").value;
    const selectedStrategy = byId("opt-strategy").value;
    const optionStrategyUniqueKey = getSelectedOptionStrategyKey();
    const quantity = +byId("opt-buy-quantity").value;
    const executionCount = +byId("opt-buy-execution-count").value;

    status.classList.remove("success");

    if (!instrumentIdA) {
        status.innerText = "نماد A را انتخاب کنید.";
        return;
    }

    if (!instrumentIdB) {
        status.innerText = "نماد B را انتخاب کنید.";
        return;
    }

    if (!selectedStrategy) {
        status.innerText = "استراتژی را انتخاب کنید.";
        return;
    }

    if (!optionStrategyUniqueKey) {
        status.innerText =
            "کلید استراتژی از کمبوباکس صفحه قابل خواندن نیست؛ مقدار نمایشی برای ارسال سفارش کافی نیست.";
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        status.innerText = "تعداد خرید را به‌صورت عدد صحیح و بزرگ‌تر از صفر وارد کنید.";
        return;
    }

    if (!Number.isInteger(executionCount) || executionCount <= 0) {
        status.innerText = "تعداد اجرا را به‌صورت عدد صحیح و بزرگ‌تر از صفر وارد کنید.";
        return;
    }

    try {

        optionExecutionStopRequested = false;
        button.disabled = true;
        stopButton.disabled = false;
        button.innerText = "خرید";
        progress.innerText = "در حال اجرا...";
        status.innerText = "";

        const auth = getBrokerAuth();
        let completedCount = 0;

        for (let step = 1; step <= executionCount; step++) {

            if (optionExecutionStopRequested) {
                status.innerText =
                    completedCount
                        ? `${completedCount} اجرا انجام شد؛ ادامه اجرا متوقف شد.`
                        : "اجرای سفارش متوقف شد.";
                return;
            }

            const askA = getAskA();
            const bidB = getBidB();

            if (!askA) {
                status.innerText = "قیمت سرخط فروش نماد A پیدا نشد.";
                return;
            }

            if (!bidB) {
                status.innerText = "قیمت سرخط خرید نماد B پیدا نشد.";
                return;
            }

            checkBuyCondition(
                askA,
                bidB
            );

            if (!getBuyConditionState(askA, bidB).isHit) {
                status.innerText =
                    completedCount
                        ? `${completedCount} اجرا انجام شد؛ چون BuyReturn دیگر مناسب نیست اجرای بعدی متوقف شد.`
                        : "BuyReturn در وضعیت مناسب نیست؛ خرید اجرا نشد.";
                return;
            }

            progress.innerText =
                `در حال ثبت خرید ${step}/${executionCount}...`;

            const payload = {
                PrincipalId: null,
                InstrumentId: instrumentIdA,
                ISensOM: "Buy",
                YValiOmNSC: "Day",
                PLimSaiOM: askA,
                QTitTotOM: quantity,
                QTitDvlOM: 0,
                extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
                optionStrategyUniqueKey,
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

            if (!response.ok || result?.response?.successful === false) {
                throw new Error(
                    getResponseErrorMessage(
                        result,
                        "ثبت سفارش خرید ناموفق بود."
                    )
                );
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    "سفارش خرید ثبت شد؛ ادامه اجرا قبل از ارسال فروش متوقف شد.";
                return;
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

            if (optionExecutionStopRequested) {
                status.innerText =
                    "سفارش خرید انجام شد؛ ادامه اجرا قبل از ارسال فروش متوقف شد.";
                return;
            }

            const latestBidB = getBidB();

            if (!latestBidB) {
                throw new Error("قیمت سرخط خرید نماد B پیدا نشد.");
            }

            progress.innerText =
                `در حال ثبت فروش ${step}/${executionCount}...`;

            const sellPayload = {
                PrincipalId: null,
                InstrumentId: instrumentIdB,
                ISensOM: "Sell",
                YValiOmNSC: "Day",
                DValiOM: null,
                PLimSaiOM: latestBidB,
                QTitTotOM: quantity,
                QTitDvlOM: 0,
                extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
                optionStrategyUniqueKey,
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

            if (!sellResponse.ok || sellResult?.response?.successful === false) {
                throw new Error(
                    getResponseErrorMessage(
                        sellResult,
                        "ثبت سفارش فروش نماد B ناموفق بود."
                    )
                );
            }

            completedCount++;
            status.innerText =
                `${completedCount} از ${executionCount} اجرا انجام شد.`;

            if (optionExecutionStopRequested) {
                status.innerText =
                    `${completedCount} اجرا انجام شد؛ ادامه اجرا متوقف شد.`;
                return;
            }
        }

        status.innerText =
            `${completedCount} اجرا با موفقیت انجام شد.`;
        status.classList.add("success");

    } catch (error) {

        status.innerText = error.message;
        status.classList.remove("success");

    } finally {

        button.disabled = false;
        stopButton.disabled = true;
        button.innerText = "خرید";
        stopButton.innerText = "توقف اجرا";
        progress.innerText = "";
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
    byId("buy-return-row").classList.remove("return-hit");

    const buyCondition = getBuyConditionState(ask, bid);

    if (buyCondition.spread <= 0)
        return;

    byId("ask-value").innerText = ask;

    byId("bid-value").innerText = bid;

    byId("buy-spread-value").innerText = buyCondition.spread;

    byId("buy-return-value").innerText =
        buyCondition.buyReturn.toFixed(2);

    if (buyCondition.isHit) {

        //playAlarm();
        byId("buy-return-row").classList.add("return-hit");
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
    byId("sell-return-row").classList.remove("return-hit");

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
        byId("sell-return-row").classList.add("return-hit");
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

byId("opt-symbol-a").onchange = () => refreshOptionStrategies();
byId("opt-symbol-b").onchange = () => refreshOptionStrategies();
byId("opt-stop-execution").onclick = () => {

    optionExecutionStopRequested = true;
    byId("opt-execution-progress").innerText = "در حال توقف...";
    byId("opt-stop-execution").disabled = true;
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
refreshOptionStrategies();
setInterval(refreshOptionSymbols, 2000);
setInterval(refreshOptionStrategies, 2000);
/*---------------------------------------------------------------------*/
