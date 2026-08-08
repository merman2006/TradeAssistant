
let selected = null;
const brokerConfig = window.PPT_BROKER_CONFIG;
const brokerAdapterFactory = window.PPT_BROKER_ADAPTERS;

if (!brokerConfig) {
    throw new Error("Broker configuration was not loaded.");
}

function createFallbackBrokerAdapter(config) {

    if (config.type === "ephoenix") {
        throw new Error(
            "Broker adapter factory was not loaded. Reload the extension before using ephoenix."
        );
    }

    const apiUrl = endpoint =>
        new URL(endpoint, config.apiBaseUrl).toString();

    const getAuth = () => {
        const value = localStorage.getItem(config.authStorageKey);

        if (!value)
            return "";

        try {
            return JSON.parse(value);
        } catch (_) {
            return String(value || "").replace(/^"+|"+$/g, "");
        }
    };

    const getFirstValue = (source, keys) => {
        for (const key of keys) {
            if (source?.[key] !== undefined && source?.[key] !== null)
                return source[key];
        }

        return undefined;
    };

    const normalizeStrategy = strategy => ({
        ...strategy,
        label: getFirstValue(strategy, [
            "label",
            "title",
            "Title",
            "name",
            "Name"
        ]),
        key: getFirstValue(strategy, [
            "key",
            "uniqueKey",
            "UniqueKey",
            "optionStrategyUniqueKey",
            "OptionStrategyUniqueKey"
        ]),
        baseInstrumentId: getFirstValue(strategy, [
            "baseInstrumentId",
            "baseStrategyInstrumentId",
            "BaseStrategyInstrumentId"
        ]),
        strategyInstrumentId: getFirstValue(strategy, [
            "strategyInstrumentId",
            "StrategyInstrumentId"
        ]),
        thirdInstrumentId: getFirstValue(strategy, [
            "thirdInstrumentId",
            "thirdStrategyInstrumentId",
            "ThirdStrategyInstrumentId"
        ])
    });

    const getArrayData = value => {
        const data = getResponseData(value);

        if (Array.isArray(data))
            return data;

        return [
            data?.items,
            data?.Items,
            data?.list,
            data?.List,
            data?.records,
            data?.Records,
            data?.data,
            data?.Data
        ].find(Array.isArray) || [];
    };

    async function fetchJson(endpoint, options = {}) {
        const response = await fetch(apiUrl(endpoint), options);
        const text = await response.text();
        let json = null;

        if (text.trim()) {
            try {
                json = JSON.parse(text);
            } catch (_) {
                json = {
                    message: text.trim()
                };
            }
        }

        if (!response.ok) {
            throw new Error(
                json?.message ||
                json?.Message ||
                json?.errorMessage ||
                json?.ErrorMessage ||
                json?.response?.message ||
                json?.response?.Message ||
                `خطای ${response.status} در ${endpoint}`
            );
        }

        return {
            response,
            json
        };
    }

    return {
        name: config.name,
        type: config.type,
        supportsOptionStrategies: true,

        isOptionPageVisible() {
            return false;
        },

        async searchInstruments(query) {
            const { json } = await fetchJson(
                config.endpoints.searchInstruments +
                "?filter=" + encodeURIComponent(query)
            );

            return json?.response?.data || [];
        },

        async placeStockOrder({ instrument, side, price, quantity }) {
            const { json } = await fetchJson(
                config.endpoints.orderEntry,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "content-type": "application/json",
                        "authorization": getAuth()
                    },
                    body: JSON.stringify({
                        PrincipalId: null,
                        InstrumentId: instrument.instrumentId,
                        ISensOM: side,
                        YValiOmNSC: "Day",
                        PLimSaiOM: price,
                        QTitTotOM: quantity,
                        QTitDvlOM: 0,
                        extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
                        ExecutionType: "Instant"
                    })
                }
            );

            return json;
        },

        async fetchOptionStrategies() {
            if (!getAuth())
                return [];

            const { json } = await fetchJson(
                config.endpoints.optionStrategies,
                {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        "content-type": "application/json",
                        "authorization": getAuth()
                    }
                }
            );

            return getArrayData(json)
                .map(normalizeStrategy)
                .filter(strategy => strategy.key);
        },

        async placeOptionOrder({
            instrumentId,
            side,
            price,
            quantity,
            strategyKey,
            validityDate = null
        }) {
            const payload = {
                PrincipalId: null,
                InstrumentId: instrumentId,
                ISensOM: side,
                YValiOmNSC: "Day",
                DValiOM: validityDate,
                PLimSaiOM: price,
                QTitTotOM: quantity,
                QTitDvlOM: 0,
                extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
                ExecutionType: "Instant"
            };

            if (strategyKey) {
                payload.optionStrategyUniqueKey = strategyKey;
            }

            const { response, json } = await fetchJson(
                config.endpoints.orderEntry,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "content-type": "application/json",
                        "authorization": getAuth()
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (json?.response?.successful === false) {
                throw new Error(
                    getResponseErrorMessage(
                        json,
                        "ثبت سفارش ناموفق بود."
                    )
                );
            }

            return {
                response,
                json
            };
        },

        async createOptionStrategy({
            instrumentIdA,
            instrumentIdB,
            quantity
        }) {
            const { response, json } = await fetchJson(
                config.endpoints.optionStrategyCreate,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "content-type": "application/json",
                        "authorization": getAuth()
                    },
                    body: JSON.stringify({
                        strategyType: "BullCallSpread",
                        baseStrategyInstrumentId: instrumentIdA,
                        strategyInstrumentId: instrumentIdB,
                        quantity,
                        customerId: null,
                        thirdStrategyInstrumentId: null
                    })
                }
            );

            return {
                response,
                json
            };
        },

        getOptionSymbols() {
            return Array
                .from(document.querySelectorAll(
                    `#sc-optionInstrumentFavoriteList > li[id^="${OPTION_INSTRUMENT_ID_PREFIX}"]`
                ))
                .map(item => {
                    const instrumentId =
                        item.id.slice(OPTION_INSTRUMENT_ID_PREFIX.length);
                    const header = item.querySelector(
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
        },

        getSelectedOptionContainer(instrumentId) {
            if (!instrumentId)
                return null;

            return document.getElementById(
                OPTION_INSTRUMENT_ID_PREFIX + instrumentId
            );
        },

        getOptionQuote(instrumentId) {
            const container = this.getSelectedOptionContainer(instrumentId);
            const bid = container?.querySelector(
                'client-instrument-price-position-row[orderside="Buy"] .-is-price .-is-clickable'
            );
            const ask = container?.querySelector(
                'client-instrument-price-position-row[orderside="Sell"] .-is-price .-is-clickable'
            );

            return {
                bid: parseOptionNumber(bid?.innerText),
                ask: parseOptionNumber(ask?.innerText)
            };
        },

        getOptionPositionValue(instrumentId, columnId) {
            if (!instrumentId)
                return null;

            const row = getOptionPositionRow(instrumentId);
            const cell = row?.querySelector(
                `[col-id="${columnId}"]`
            );

            return parseOptionNumber(cell?.innerText);
        },

        async isOptionBuyOrderExecuted() {
            await delay(1000);
            return true;
        }
    };
}

const brokerAdapter = brokerAdapterFactory
    ? brokerAdapterFactory.create(brokerConfig)
    : createFallbackBrokerAdapter(brokerConfig);
const root = document
    .getElementById("ppt-extension-root")
    .shadowRoot;

const byId = id => root.getElementById(id);
const DERIVATIVE_MAIN_HOSTS = [
    "khobregan.tsetab.ir",
    "khobregan-red.tsetab.ir",
    "gs.ephoenix.ir"
];
const DERIVATIVE_MAIN_HASH = "#/stock/derivative/main";
let derivativePanelManualOverride = false;

function isDerivativeMainPage() {

    if (brokerAdapter.isOptionPageVisible?.())
        return true;

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

    return brokerAdapter.searchInstruments(q);
}

async function send(side) {

    const log = byId("log");

    try {

        const price = +byId("price").value;
        const qty = +byId("qty").value;

        const result = await brokerAdapter.placeStockOrder({
            instrument: selected,
            side,
            price,
            quantity: qty
        });

        log.innerText = JSON.stringify(result, null, 2);

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
let optionOffsetExecutionStopRequested = false;
let optionPositionsTabClickRequested = false;
const ALARM_BEEP_COUNT = 5;
const ALARM_BEEP_INTERVAL_MS = 500;
const optionAlarmStates = {
    buy: { isHit: false, signature: null },
    offset: { isHit: false, signature: null }
};
const OPTION_PREFERENCES_STORAGE_PREFIX = "ppt-option-preference:";
const OPTION_PERSISTED_FIELDS = [
    { id: "opt-auto-values", type: "checkbox" },
    { id: "opt-auto-buy-buttons", type: "checkbox" },
    { id: "opt-sync-order-quantities", type: "checkbox" },
    { id: "opt-alarm-enabled", type: "checkbox" },
    { id: "opt-alarm-count", type: "value" },
    { id: "opt-alarm-interval", type: "value" },
    { id: "opt-expected-return", type: "value" },
    { id: "opt-expected-offset-return", type: "value" },
    { id: "opt-buy-execution-count", type: "value" },
    { id: "opt-sell-execution-count", type: "value" },
    { id: "opt-buy-quantity", type: "value" },
    { id: "opt-buy-sell-quantity", type: "value" },
    { id: "opt-offset-buy-quantity", type: "value" },
    { id: "opt-sell-quantity", type: "value" }
];

const OPTION_INSTRUMENT_ID_PREFIX = "option-instrument-focus-target-";
const OPTION_POSITIONS_TAB_LABEL = "موقعیت های اختیار";
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

    return brokerAdapter.getOptionSymbols();
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

async function refreshOptionSymbols(autoStartMonitoring = true) {

    const symbols = await getOptionSymbols();
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
        await updateAutoOptionValues();
        syncInitialPositionButtonVisibility();
        if (autoStartMonitoring) {
            startOptionMonitoringIfReady();
        }
    } else {
        const message = brokerAdapter.getOptionSymbolsEmptyMessage?.() ||
            "ابتدا قراردادهای موردنظر را به لیست نمادهای صفحه اضافه کنید.";

        symbolA.innerHTML = '<option value="">نمادی در صفحه پیدا نشد</option>';
        symbolB.innerHTML = '<option value="">نمادی در صفحه پیدا نشد</option>';
        status.innerText = message;
        syncInitialPositionButtonVisibility();
    }
}

function escapeSelectorValue(value) {

    if (window.CSS?.escape)
        return CSS.escape(value);

    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
}

function normalizeNumberText(value) {

    const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

    return String(value || "")
        .replace(/[۰-۹]/g, digit => persianDigits.indexOf(digit))
        .replace(/[٠-٩]/g, digit => arabicDigits.indexOf(digit))
        .replace(/,/g, "")
        .trim();
}

function parseOptionNumber(value) {

    const normalizedValue = normalizeNumberText(value)
        .replace(/[^\d.-]/g, "");

    if (!normalizedValue)
        return null;

    const number = Number(normalizedValue);

    return Number.isFinite(number)
        ? number
        : null;
}

function formatOptionAutoValue(value) {

    return Number.isInteger(value)
        ? String(value)
        : String(Number(value.toFixed(2)));
}

function normalizeDomText(value) {

    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function getOptionPositionsTabButton() {

    return Array
        .from(document.querySelectorAll("button.c-tab, .c-tab"))
        .find(button =>
            normalizeDomText(button.innerText)
                .includes(OPTION_POSITIONS_TAB_LABEL)
        );
}

function isOptionPositionsTabSelected(button) {

    return !!button?.closest(".-is-selected, .active, .selected");
}

function ensureOptionPositionsTabLoaded() {

    if (optionPositionsTabClickRequested)
        return;

    const button = getOptionPositionsTabButton();

    if (!button)
        return;

    optionPositionsTabClickRequested = true;

    if (isOptionPositionsTabSelected(button))
        return;

    button.click();
}

function getOptionPositionRow(instrumentId) {

    if (!instrumentId)
        return null;

    return document.querySelector(
        `.ag-center-cols-container [role="row"][row-id="${escapeSelectorValue(instrumentId)}"]`
    );
}

function syncInitialPositionButtonVisibility() {

    const initialButton = byId("opt-initial-position-order");
    const openButton = byId("opt-buy-order");

    if (!initialButton || !openButton)
        return;

    if (!byId("opt-auto-buy-buttons")?.checked) {
        initialButton.hidden = false;
        openButton.hidden = false;
        return;
    }

    if (!isParsianLikeBroker()) {
        initialButton.hidden = true;
        openButton.hidden = false;
        return;
    }

    const instrumentIdA = byId("opt-symbol-a").value;
    const instrumentIdB = byId("opt-symbol-b").value;

    if (!instrumentIdA || !instrumentIdB) {
        initialButton.hidden = true;
        openButton.hidden = false;
        return;
    }

    const hasBothPositions =
        !!getOptionPositionRow(instrumentIdA) &&
        !!getOptionPositionRow(instrumentIdB);

    initialButton.hidden = hasBothPositions;
    openButton.hidden = !hasBothPositions;

    if (!hasBothPositions) {
        ensureOptionPositionsTabLoaded();
    }
}

function getOptionPositionValue(instrumentId, columnId) {

    if (brokerAdapter.getOptionPositionValue) {
        return brokerAdapter.getOptionPositionValue(instrumentId, columnId);
    }

    const row = getOptionPositionRow(instrumentId);
    const cell = row?.querySelector(
        `[col-id="${columnId}"]`
    );

    return parseOptionNumber(cell?.innerText);
}

async function updateAutoOptionValues() {

    if (!byId("opt-auto-values")?.checked)
        return;

    const instrumentIdA = byId("opt-symbol-a").value;
    const instrumentIdB = byId("opt-symbol-b").value;

    if (!instrumentIdA || !instrumentIdB)
        return;

    if (brokerAdapter.getOptionAutoValues) {
        const values = brokerAdapter.getOptionAutoValues(
            instrumentIdA,
            instrumentIdB
        );

        if (values?.premium !== null && values?.premium !== undefined) {
            byId("opt-premium").value = formatOptionAutoValue(
                values.premium
            );
        }

        if (values?.maxValue !== null && values?.maxValue !== undefined) {
            byId("opt-max-value").value = formatOptionAutoValue(
                values.maxValue
            );
        }

        return;
    }

    const positionRowA = getOptionPositionRow(instrumentIdA);
    const positionRowB = getOptionPositionRow(instrumentIdB);

    if (
        !positionRowA ||
        !positionRowB
    ) {
        ensureOptionPositionsTabLoaded();
        return;
    }

    const breakEvenA = getOptionPositionValue(
        instrumentIdA,
        "breakEvenPrice"
    );
    const breakEvenB = getOptionPositionValue(
        instrumentIdB,
        "breakEvenPrice"
    );
    const strikeA = getOptionPositionValue(
        instrumentIdA,
        "strikePrice"
    );
    const strikeB = getOptionPositionValue(
        instrumentIdB,
        "strikePrice"
    );

    if (breakEvenA !== null && breakEvenB !== null) {
        byId("opt-premium").value = formatOptionAutoValue(
            Math.abs(breakEvenA - breakEvenB)
        );
    }

    if (strikeA !== null && strikeB !== null) {
        byId("opt-max-value").value = formatOptionAutoValue(
            Math.abs(strikeB - strikeA)
        );
    }
}

function findStrategyKey(value) {

    return value?.match(OPTION_STRATEGY_KEY_PATTERN)?.[0] || "";
}

function normalizeOptionStrategyKey(value) {

    return String(value || "").trim();
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

    if (strategy.label)
        return strategy.label;

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

    const data = await brokerAdapter.fetchOptionStrategies();

    return (Array.isArray(data) ? data : [])
        .map(strategy => ({
            label: normalizeOptionStrategyLabel(
                getOptionStrategyTitle(strategy)
            ),
            key: normalizeOptionStrategyKey(strategy.key || strategy.uniqueKey),
            baseInstrumentId:
                String(strategy.baseInstrumentId || strategy.baseStrategyInstrumentId || ""),
            strategyInstrumentId:
                String(strategy.strategyInstrumentId || ""),
            thirdInstrumentId:
                String(strategy.thirdInstrumentId || strategy.thirdStrategyInstrumentId || "")
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

    return strategies.reduce((distinctStrategies, strategy) => {

        const current = getOptionStrategyIdentity(strategy);
        const duplicateIndex = distinctStrategies.findIndex(item => {

            const candidate = getOptionStrategyIdentity(item);

            return (!!current.key && current.key === candidate.key) ||
                (!!current.label && current.label === candidate.label);
        });

        if (duplicateIndex === -1) {
            distinctStrategies.push(strategy);
            return distinctStrategies;
        }

        const existing = distinctStrategies[duplicateIndex];

        distinctStrategies[duplicateIndex] = {
            ...existing,
            key: existing.key || strategy.key,
            label: existing.label || strategy.label,
            baseInstrumentId:
                existing.baseInstrumentId || strategy.baseInstrumentId,
            strategyInstrumentId:
                existing.strategyInstrumentId || strategy.strategyInstrumentId,
            thirdInstrumentId:
                existing.thirdInstrumentId || strategy.thirdInstrumentId,
            isInDefaultSelect:
                existing.isInDefaultSelect || strategy.isInDefaultSelect
        };

        return distinctStrategies;
    }, []);
}

function getOptionStrategies() {

    if (brokerAdapter.getOptionStrategies) {
        return distinctOptionStrategies(
            brokerAdapter.getOptionStrategies()
        );
    }

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
            key: getStrategyKeyFromElement(item),
            isInDefaultSelect: true
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
            normalizeOptionStrategyKey(strategy.key) && (
            normalizeOptionStrategyKey(strategy.key) ===
                normalizeOptionStrategyKey(currentOption?.dataset.strategyKey) ||
            normalizeOptionStrategyLabel(strategy.label) ===
                normalizeOptionStrategyLabel(currentOption?.innerText)
        )
    );

    if (
        !symbolsChanged &&
        currentOption?.dataset.strategyKey &&
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
            ),
            isInDefaultSelect: !!strategy.isInDefaultSelect
        }))
        .filter(item => item.score > 0)
        .sort((first, second) => {

            const firstHasKey = !!first.strategy.key;
            const secondHasKey = !!second.strategy.key;

            if (firstHasKey !== secondHasKey) {
                return firstHasKey ? -1 : 1;
            }

            if (first.isInDefaultSelect !== second.isInDefaultSelect) {
                return first.isInDefaultSelect ? -1 : 1;
            }

            return second.score - first.score;
        })[0]?.strategy;

    if (matchedStrategy) {
        const matchedKey = normalizeOptionStrategyKey(matchedStrategy.key);
        const matchedLabel = normalizeOptionStrategyLabel(matchedStrategy.label);
        const matchedOption = Array
            .from(select.options)
            .find(option =>
                (
                    matchedKey &&
                    normalizeOptionStrategyKey(option.dataset.strategyKey) === matchedKey
                ) ||
                (
                    matchedKey &&
                    normalizeOptionStrategyKey(option.value) === matchedKey
                ) ||
                (
                    matchedLabel &&
                    normalizeOptionStrategyLabel(option.innerText) === matchedLabel
                )
            );

        if (matchedOption) {
            select.value = matchedOption.value;
        }

        return;
    }

    selectMissingOptionStrategy(
        select,
        "استراتژی مناسب پیدا نشد"
    );
}

async function refreshOptionStrategies() {

    const select = byId("opt-strategy");

    if (brokerAdapter.supportsOptionStrategies === false) {
        if (optionStrategiesSignature === "unsupported")
            return;

        optionStrategiesSignature = "unsupported";
        select.innerHTML = "";

        const option = document.createElement("option");
        option.value = "";
        option.innerText = "برای این کارگزاری نیاز نیست";
        select.appendChild(option);
        return;
    }

    const cachedStrategies = Array
        .from(select.options)
        .filter(option => option.value)
        .filter(option => option.value !== OPTION_STRATEGY_NOT_FOUND_VALUE)
        .map(option => ({
            label: normalizeOptionStrategyLabel(option.innerText),
            key: option.dataset.strategyKey || findStrategyKey(option.value),
            baseInstrumentId: option.dataset.baseInstrumentId,
            strategyInstrumentId: option.dataset.strategyInstrumentId,
            thirdInstrumentId: option.dataset.thirdInstrumentId,
            isInDefaultSelect: option.dataset.isInDefaultSelect === "true"
        }))
        .filter(strategy => strategy.label);

    let fetchedStrategies = [];

    try {

        optionStrategiesRequest =
            optionStrategiesRequest || fetchOptionStrategies();

        fetchedStrategies = await optionStrategiesRequest;

    } catch (error) {

        if (!isTransientOptionStrategyError(error)) {
            console.warn("Could not fetch option strategies", error);
        }
    } finally {

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
        .map(strategy => [
            strategy.key,
            strategy.label,
            strategy.baseInstrumentId,
            strategy.strategyInstrumentId,
            strategy.thirdInstrumentId,
            strategy.isInDefaultSelect ? "dom" : "api"
        ].join(":"))
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
        const strategyKey = normalizeOptionStrategyKey(strategy.key);

        option.value = strategyKey || strategy.label;
        option.innerText = strategy.label;

        if (strategyKey) {
            option.dataset.strategyKey = strategyKey;
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

        if (strategy.isInDefaultSelect) {
            option.dataset.isInDefaultSelect = "true";
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

function isTransientOptionStrategyError(error) {

    const message = String(error?.message || "");

    return window.location.href.includes("/login") ||
        (
            brokerConfig.authStorageKey &&
            !localStorage.getItem(brokerConfig.authStorageKey)
        ) ||
        (
            error instanceof SyntaxError &&
            message.includes("Unexpected end of JSON input")
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

    if (brokerAdapter.getSelectedOptionContainer) {
        return brokerAdapter.getSelectedOptionContainer(instrumentId);
    }

    return document.getElementById(
        OPTION_INSTRUMENT_ID_PREFIX + instrumentId
    );
}

async function isOptionBuyOrderExecuted(orderInfo) {

    return brokerAdapter.isOptionBuyOrderExecuted(orderInfo);
}

function delay(milliseconds) {

    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getBuyConditionState(ask, bid) {

    const maxValue = +byId("opt-max-value").value;
    const expected = +byId("opt-expected-return").value;
    const spread = ask - bid;

    if (spread <= 0) {
        return {
            expected,
            spread,
            buyReturn: null,
            isHit: false
        };
    }

    const buyReturn = ((maxValue / spread) - 1) * 100;

    return {
        expected,
        spread,
        buyReturn,
        isHit: buyReturn > expected
    };
}

function getOffsetConditionState(bidA, askB) {

    const premium = +byId("opt-premium").value;
    const expectedOffsetReturn =
        +byId("opt-expected-offset-return").value;
    const spread = bidA - askB;

    if (premium <= 0) {
        return {
            expected: expectedOffsetReturn,
            spread,
            offsetReturn: null,
            isHit: false
        };
    }

    const offsetReturn = ((spread / premium) - 1) * 100;

    return {
        expected: expectedOffsetReturn,
        spread,
        offsetReturn,
        isHit: offsetReturn > expectedOffsetReturn
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
    const buyQuantityA = +byId("opt-buy-quantity").value;
    const sellQuantityB = +byId("opt-buy-sell-quantity").value;
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

    if (brokerAdapter.supportsOptionStrategies !== false && !selectedStrategy) {
        status.innerText = "استراتژی را انتخاب کنید.";
        return;
    }

    if (brokerAdapter.supportsOptionStrategies !== false && !optionStrategyUniqueKey) {
        status.innerText =
            "کلید استراتژی از کمبوباکس صفحه قابل خواندن نیست؛ مقدار نمایشی برای ارسال سفارش کافی نیست.";
        return;
    }

    if (!Number.isInteger(buyQuantityA) || buyQuantityA < 0) {
        status.innerText = "تعداد خرید A را به‌صورت عدد صحیح و صفر یا بزرگ‌تر وارد کنید.";
        return;
    }

    if (!Number.isInteger(sellQuantityB) || sellQuantityB < 0) {
        status.innerText = "تعداد فروش B را به‌صورت عدد صحیح و صفر یا بزرگ‌تر وارد کنید.";
        return;
    }

    if (buyQuantityA === 0 && sellQuantityB === 0) {
        status.innerText = "حداقل یکی از تعدادهای خرید A یا فروش B باید بزرگ‌تر از صفر باشد.";
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
        button.innerText = "باز کردن موقعیت";
        progress.innerText = "در حال اجرا...";
        status.innerText = "";

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

            let result = null;

            if (buyQuantityA > 0) {
                progress.innerText =
                    `در حال ثبت خرید ${step}/${executionCount}...`;

                const orderResult = await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdA,
                    side: "Buy",
                    price: askA,
                    quantity: buyQuantityA,
                    strategyKey: optionStrategyUniqueKey
                });

                result = orderResult.json;
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    buyQuantityA > 0
                        ? "سفارش خرید ثبت شد؛ ادامه اجرا قبل از ارسال فروش متوقف شد."
                        : "ادامه اجرا قبل از ارسال فروش متوقف شد.";
                return;
            }

            let buyExecuted = true;

            if (buyQuantityA > 0) {
                status.innerText = "در حال بررسی انجام شدن خرید نماد A...";

                buyExecuted = await isOptionBuyOrderExecuted({
                    instrumentId: instrumentIdA,
                    price: askA,
                    quantity: buyQuantityA,
                    orderResponse: result
                });
            }

            if (!buyExecuted) {
                status.innerText =
                    "سفارش خرید A ثبت شد؛ بررسی انجام معامله هنوز پیاده‌سازی نشده و فروش B ارسال نشد.";
                return;
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    buyQuantityA > 0
                        ? "سفارش خرید انجام شد؛ ادامه اجرا قبل از ارسال فروش متوقف شد."
                        : "ادامه اجرا قبل از ارسال فروش متوقف شد.";
                return;
            }

            const latestBidB = getBidB();

            if (sellQuantityB > 0 && !latestBidB) {
                throw new Error("قیمت سرخط خرید نماد B پیدا نشد.");
            }

            if (sellQuantityB > 0) {
                progress.innerText =
                    `در حال ثبت فروش ${step}/${executionCount}...`;

                await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdB,
                    side: "Sell",
                    price: latestBidB,
                    quantity: sellQuantityB,
                    strategyKey: optionStrategyUniqueKey
                });
            }

            completedCount++;
            status.innerText =
                `${completedCount} از ${executionCount} اجرا انجام شد.`;

            if (optionExecutionStopRequested) {
                status.innerText =
                    `${completedCount} اجرا انجام شد؛ ادامه اجرا متوقف شد.`;
                return;
            }

            await delay(1000);
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
        button.innerText = "باز کردن موقعیت";
        stopButton.innerText = "توقف اجرا";
        progress.innerText = "";
    }
}

function isParsianLikeBroker() {

    return brokerConfig.type === "parsian" ||
        brokerConfig.type === "khobregan";
}

function findStrategyKeyInResponse(value, seen = new Set()) {

    if (value === null || value === undefined)
        return "";

    if (typeof value === "string")
        return findStrategyKey(value);

    if (typeof value !== "object")
        return "";

    if (seen.has(value))
        return "";

    seen.add(value);

    const directKey = [
        value.key,
        value.uniqueKey,
        value.UniqueKey,
        value.optionStrategyUniqueKey,
        value.OptionStrategyUniqueKey
    ]
        .map(item => normalizeOptionStrategyKey(item))
        .find(Boolean);

    if (directKey)
        return directKey;

    for (const item of Object.values(value)) {
        const key = findStrategyKeyInResponse(item, seen);

        if (key)
            return key;
    }

    return "";
}

async function createInitialOptionStrategy({
    instrumentIdA,
    instrumentIdB,
    quantity
}) {

    if (!brokerAdapter.createOptionStrategy) {
        throw new Error("ساخت استراتژی برای این کارگزاری پشتیبانی نمی‌شود.");
    }

    const { json } = await brokerAdapter.createOptionStrategy({
        instrumentIdA,
        instrumentIdB,
        quantity
    });

    const responseKey = findStrategyKeyInResponse(json);

    if (responseKey)
        return responseKey;

    optionStrategiesSignature = null;

    const strategies = await fetchOptionStrategies();
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

    return normalizeOptionStrategyKey(matchedStrategy?.key);
}

async function sendInitialOptionPositionOrder() {

    await refreshOptionStrategies();

    const button = byId("opt-initial-position-order");
    const stopButton = byId("opt-stop-execution");
    const progress = byId("opt-execution-progress");
    const status = byId("option-symbols-status");
    const instrumentIdA = byId("opt-symbol-a").value;
    const instrumentIdB = byId("opt-symbol-b").value;
    const buyQuantityA = +byId("opt-buy-quantity").value;
    const sellQuantityB = +byId("opt-buy-sell-quantity").value;
    const executionCount = +byId("opt-buy-execution-count").value;

    status.classList.remove("success");

    if (!isParsianLikeBroker()) {
        status.innerText = "موقعیت اول فقط برای پارسیان و خبرگان فعال است.";
        return;
    }

    if (!instrumentIdA) {
        status.innerText = "نماد A را انتخاب کنید.";
        return;
    }

    if (!instrumentIdB) {
        status.innerText = "نماد B را انتخاب کنید.";
        return;
    }

    if (!Number.isInteger(buyQuantityA) || buyQuantityA < 0) {
        status.innerText = "تعداد خرید A را به‌صورت عدد صحیح و صفر یا بزرگ‌تر وارد کنید.";
        return;
    }

    if (!Number.isInteger(sellQuantityB) || sellQuantityB < 0) {
        status.innerText = "تعداد فروش B را به‌صورت عدد صحیح و صفر یا بزرگ‌تر وارد کنید.";
        return;
    }

    if (buyQuantityA === 0 && sellQuantityB === 0) {
        status.innerText = "حداقل یکی از تعدادهای خرید A یا فروش B باید بزرگ‌تر از صفر باشد.";
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
        progress.innerText = "در حال اجرای موقعیت اول...";
        status.innerText = "";

        let completedCount = 0;

        for (let step = 1; step <= executionCount; step++) {

            if (optionExecutionStopRequested) {
                status.innerText =
                    completedCount
                        ? `${completedCount} اجرای موقعیت اول انجام شد؛ ادامه اجرا متوقف شد.`
                        : "اجرای موقعیت اول متوقف شد.";
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

            checkBuyCondition(askA, bidB);

            if (!getBuyConditionState(askA, bidB).isHit) {
                status.innerText =
                    completedCount
                        ? `${completedCount} اجرای موقعیت اول انجام شد؛ چون BuyReturn دیگر مناسب نیست اجرای بعدی متوقف شد.`
                        : "BuyReturn در وضعیت مناسب نیست؛ موقعیت اول اجرا نشد.";
                return;
            }

            let buyResult = null;

            if (buyQuantityA > 0) {
                progress.innerText =
                    `در حال ثبت خرید اولیه ${step}/${executionCount}...`;

                const orderResult = await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdA,
                    side: "Buy",
                    price: askA,
                    quantity: buyQuantityA,
                    strategyKey: null
                });

                buyResult = orderResult.json;
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    buyQuantityA > 0
                        ? "سفارش خرید اولیه ثبت شد؛ ادامه قبل از ساخت استراتژی متوقف شد."
                        : "ادامه قبل از ساخت استراتژی متوقف شد.";
                return;
            }

            let buyExecuted = true;

            if (buyQuantityA > 0) {
                status.innerText = "در حال بررسی انجام شدن خرید اولیه...";

                buyExecuted = await isOptionBuyOrderExecuted({
                    instrumentId: instrumentIdA,
                    price: askA,
                    quantity: buyQuantityA,
                    orderResponse: buyResult
                });
            }

            if (!buyExecuted) {
                status.innerText =
                    "سفارش خرید اولیه ثبت شد؛ تا انجام شدن خرید، ساخت استراتژی و فروش انجام نشد.";
                return;
            }

            progress.innerText =
                `در حال ساخت استراتژی ${step}/${executionCount}...`;

            const strategyKey = await createInitialOptionStrategy({
                instrumentIdA,
                instrumentIdB,
                quantity: buyQuantityA || sellQuantityB,
                buyOrderResponse: buyResult
            });

            if (!strategyKey) {
                throw new Error("ساخت استراتژی انجام شد ولی کلید استراتژی برنگشت.");
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    "استراتژی ساخته شد؛ ادامه قبل از ارسال فروش متوقف شد.";
                return;
            }

            const latestBidB = getBidB();

            if (sellQuantityB > 0 && !latestBidB) {
                throw new Error("قیمت سرخط خرید نماد B پیدا نشد.");
            }

            if (sellQuantityB > 0) {
                progress.innerText =
                    `در حال ثبت فروش ${step}/${executionCount}...`;

                await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdB,
                    side: "Sell",
                    price: latestBidB,
                    quantity: sellQuantityB,
                    strategyKey
                });
            }

            completedCount++;
            status.innerText =
                `${completedCount} از ${executionCount} اجرای موقعیت اول انجام شد.`;

            if (optionExecutionStopRequested) {
                status.innerText =
                    `${completedCount} اجرای موقعیت اول انجام شد؛ ادامه متوقف شد.`;
                return;
            }

            await delay(1000);
        }

        status.innerText =
            `${completedCount} اجرای موقعیت اول با موفقیت انجام شد.`;
        status.classList.add("success");
        byId("opt-initial-position-order").hidden = true;
        byId("opt-buy-order").hidden = false;

    } catch (error) {

        status.innerText = error.message;
        status.classList.remove("success");

    } finally {

        button.disabled = false;
        stopButton.disabled = true;
        stopButton.innerText = "توقف اجرا";
        progress.innerText = "";
    }
}

async function sendOptionOffsetOrder() {

    await refreshOptionStrategies();

    const button = byId("opt-sell-order");
    const stopButton = byId("opt-stop-offset-execution");
    const progress = byId("opt-offset-execution-progress");
    const status = byId("option-symbols-status");
    const instrumentIdA = byId("opt-symbol-a").value;
    const instrumentIdB = byId("opt-symbol-b").value;
    const selectedStrategy = byId("opt-strategy").value;
    const optionStrategyUniqueKey = getSelectedOptionStrategyKey();
    const buyQuantityB = +byId("opt-offset-buy-quantity").value;
    const sellQuantityA = +byId("opt-sell-quantity").value;
    const executionCount = +byId("opt-sell-execution-count").value;

    status.classList.remove("success");

    if (!instrumentIdA) {
        status.innerText = "نماد A را انتخاب کنید.";
        return;
    }

    if (!instrumentIdB) {
        status.innerText = "نماد B را انتخاب کنید.";
        return;
    }

    if (brokerAdapter.supportsOptionStrategies !== false && !selectedStrategy) {
        status.innerText = "استراتژی را انتخاب کنید.";
        return;
    }

    if (brokerAdapter.supportsOptionStrategies !== false && !optionStrategyUniqueKey) {
        status.innerText =
            "کلید استراتژی از کمبوباکس صفحه قابل خواندن نیست؛ مقدار نمایشی برای ارسال سفارش کافی نیست.";
        return;
    }

    if (!Number.isInteger(buyQuantityB) || buyQuantityB < 0) {
        status.innerText = "تعداد خرید B را به‌صورت عدد صحیح و صفر یا بزرگ‌تر وارد کنید.";
        return;
    }

    if (!Number.isInteger(sellQuantityA) || sellQuantityA < 0) {
        status.innerText = "تعداد فروش A را به‌صورت عدد صحیح و صفر یا بزرگ‌تر وارد کنید.";
        return;
    }

    if (buyQuantityB === 0 && sellQuantityA === 0) {
        status.innerText = "حداقل یکی از تعدادهای خرید B یا فروش A باید بزرگ‌تر از صفر باشد.";
        return;
    }

    if (!Number.isInteger(executionCount) || executionCount <= 0) {
        status.innerText = "تعداد اجرا را به‌صورت عدد صحیح و بزرگ‌تر از صفر وارد کنید.";
        return;
    }

    try {

        optionOffsetExecutionStopRequested = false;
        button.disabled = true;
        stopButton.disabled = false;
        button.innerText = "آفست موقعیت";
        progress.innerText = "در حال اجرا...";
        status.innerText = "";

        let completedCount = 0;

        for (let step = 1; step <= executionCount; step++) {

            if (optionOffsetExecutionStopRequested) {
                status.innerText =
                    completedCount
                        ? `${completedCount} اجرا انجام شد؛ ادامه آفست متوقف شد.`
                        : "اجرای آفست متوقف شد.";
                return;
            }

            const askB = getAskB();
            const bidA = getBidA();

            if (!askB) {
                status.innerText = "قیمت سرخط فروش نماد B پیدا نشد.";
                return;
            }

            if (!bidA) {
                status.innerText = "قیمت سرخط خرید نماد A پیدا نشد.";
                return;
            }

            checkSellCondition(
                bidA,
                askB
            );

            if (!getOffsetConditionState(bidA, askB).isHit) {
                status.innerText =
                    completedCount
                        ? `${completedCount} اجرا انجام شد؛ چون OffsetReturn دیگر مناسب نیست اجرای بعدی متوقف شد.`
                        : "OffsetReturn در وضعیت مناسب نیست؛ آفست اجرا نشد.";
                return;
            }

            let buyResult = null;

            if (buyQuantityB > 0) {
                progress.innerText =
                    `در حال ثبت خرید B ${step}/${executionCount}...`;

                const orderResult = await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdB,
                    side: "Buy",
                    price: askB,
                    quantity: buyQuantityB,
                    strategyKey: optionStrategyUniqueKey
                });

                buyResult = orderResult.json;
            }

            if (optionOffsetExecutionStopRequested) {
                status.innerText =
                    buyQuantityB > 0
                        ? "سفارش خرید B ثبت شد؛ ادامه آفست قبل از ارسال فروش A متوقف شد."
                        : "ادامه آفست قبل از ارسال فروش A متوقف شد.";
                return;
            }

            let buyExecuted = true;

            if (buyQuantityB > 0) {
                status.innerText = "در حال بررسی انجام شدن خرید نماد B...";

                buyExecuted = await isOptionBuyOrderExecuted({
                    instrumentId: instrumentIdB,
                    price: askB,
                    quantity: buyQuantityB,
                    orderResponse: buyResult
                });
            }

            if (!buyExecuted) {
                status.innerText =
                    "سفارش خرید B ثبت شد؛ بررسی انجام معامله هنوز پیاده‌سازی نشده و فروش A ارسال نشد.";
                return;
            }

            if (optionOffsetExecutionStopRequested) {
                status.innerText =
                    buyQuantityB > 0
                        ? "سفارش خرید B انجام شد؛ ادامه آفست قبل از ارسال فروش A متوقف شد."
                        : "ادامه آفست قبل از ارسال فروش A متوقف شد.";
                return;
            }

            const latestBidA = getBidA();

            if (sellQuantityA > 0 && !latestBidA) {
                throw new Error("قیمت سرخط خرید نماد A پیدا نشد.");
            }

            if (sellQuantityA > 0) {
                progress.innerText =
                    `در حال ثبت فروش A ${step}/${executionCount}...`;

                await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdA,
                    side: "Sell",
                    price: latestBidA,
                    quantity: sellQuantityA,
                    strategyKey: optionStrategyUniqueKey
                });
            }

            completedCount++;
            status.innerText =
                `${completedCount} از ${executionCount} اجرای آفست انجام شد.`;

            if (optionOffsetExecutionStopRequested) {
                status.innerText =
                    `${completedCount} اجرای آفست انجام شد؛ ادامه متوقف شد.`;
                return;
            }

            await delay(1000);
        }

        status.innerText =
            `${completedCount} اجرای آفست با موفقیت انجام شد.`;
        status.classList.add("success");

    } catch (error) {

        status.innerText = error.message;
        status.classList.remove("success");

    } finally {

        button.disabled = false;
        stopButton.disabled = true;
        button.innerText = "آفست موقعیت";
        stopButton.innerText = "توقف اجرا";
        progress.innerText = "";
    }
}

function getOptionAlarmSettings() {

    const count = Number(byId("opt-alarm-count").value);
    const interval = Number(byId("opt-alarm-interval").value);

    return {
        isEnabled: byId("opt-alarm-enabled").checked,
        beepCount:
            Number.isInteger(count) && count > 0
                ? count
                : ALARM_BEEP_COUNT,
        interval:
            Number.isFinite(interval) && interval >= 100
                ? interval
                : ALARM_BEEP_INTERVAL_MS
    };
}

function playAlarm() {

    const alarmSettings = getOptionAlarmSettings();

    if (!alarmSettings.isEnabled)
        return;

    let remainingBeeps = alarmSettings.beepCount;

    const beep = () => {

        const audio = new Audio(
            "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
        );

        audio.play().catch(() => {});

        remainingBeeps--;

        if (remainingBeeps > 0) {
            setTimeout(beep, alarmSettings.interval);
        }
    };

    beep();
}

function updateOptionAlarmState(type, isHit, signature = null) {

    const state = optionAlarmStates[type];

    if (state.signature !== signature) {
        state.isHit = false;
        state.signature = signature;
    }

    if (isHit && !state.isHit) {
        playAlarm();
    }

    state.isHit = isHit;
}

function resetOptionAlarmStates() {

    optionAlarmStates.buy.isHit = false;
    optionAlarmStates.buy.signature = null;
    optionAlarmStates.offset.isHit = false;
    optionAlarmStates.offset.signature = null;
}

function syncOptionAlarmControlsVisibility() {

    const isEnabled = byId("opt-alarm-enabled").checked;

    byId("opt-alarm-row").classList.toggle(
        "alarm-enabled",
        isEnabled
    );
    byId("opt-alarm-count-field").hidden = !isEnabled;
    byId("opt-alarm-interval-field").hidden = !isEnabled;
}

function getOptionPreferenceKey(id) {

    return OPTION_PREFERENCES_STORAGE_PREFIX + id;
}

function saveOptionPreference(id, type) {

    const el = byId(id);

    if (!el)
        return;

    const value =
        type === "checkbox"
            ? String(el.checked)
            : el.value;

    localStorage.setItem(getOptionPreferenceKey(id), value);
}

function loadOptionPreferences() {

    OPTION_PERSISTED_FIELDS.forEach(field => {

        const el = byId(field.id);

        if (!el)
            return;

        const value = localStorage.getItem(
            getOptionPreferenceKey(field.id)
        );

        if (value === null)
            return;

        if (field.type === "checkbox") {
            el.checked = value === "true";
        } else {
            el.value = value;
        }
    });

    const settingsBody = byId("opt-settings-body");
    const settingsToggle = byId("opt-settings-toggle");
    const isSettingsOpen =
        localStorage.getItem(
            getOptionPreferenceKey("opt-settings-open")
        ) === "true";

    settingsBody.hidden = !isSettingsOpen;
    settingsToggle.innerText = isSettingsOpen ? "-" : "+";
}

function bindOptionPreferencePersistence() {

    OPTION_PERSISTED_FIELDS.forEach(field => {

        const el = byId(field.id);

        if (!el)
            return;

        const eventName =
            field.type === "checkbox"
                ? "change"
                : "input";

        el.addEventListener(eventName, () => {
            saveOptionPreference(field.id, field.type);
        });
    });
}

function resetOptionPreferences() {

    OPTION_PERSISTED_FIELDS.forEach(field => {

        const el = byId(field.id);

        localStorage.removeItem(getOptionPreferenceKey(field.id));

        if (!el)
            return;

        if (field.type === "checkbox") {
            el.checked = el.defaultChecked;
        } else {
            el.value = el.defaultValue;
        }
    });

    localStorage.removeItem(getOptionPreferenceKey("opt-settings-open"));
    resetOptionAlarmStates();
    syncOrderQuantityPairs();
    syncOptionAlarmControlsVisibility();
    updateAutoOptionValues().catch(error => {
        byId("option-symbols-status").innerText = error.message;
    });
}

function areOrderQuantitiesSynced() {

    return byId("opt-sync-order-quantities")?.checked;
}

function syncQuantityInputValue(sourceId, targetId) {

    if (!areOrderQuantitiesSynced())
        return;

    const source = byId(sourceId);
    const target = byId(targetId);

    if (!source || !target || target.value === source.value)
        return;

    target.value = source.value;
    saveOptionPreference(targetId, "value");
}

function syncOrderQuantityPairs() {

    syncQuantityInputValue("opt-buy-quantity", "opt-buy-sell-quantity");
    syncQuantityInputValue("opt-offset-buy-quantity", "opt-sell-quantity");
}

function bindSyncedQuantityInputs(firstId, secondId) {

    byId(firstId).addEventListener("input", () => {
        syncQuantityInputValue(firstId, secondId);
    });

    byId(secondId).addEventListener("input", () => {
        syncQuantityInputValue(secondId, firstId);
    });
}

function checkBuyCondition(
    ask,
    bid
) {
    byId("buy-return-row").classList.remove("return-hit");

    const buyCondition = getBuyConditionState(ask, bid);

    if (buyCondition.spread <= 0) {
        updateOptionAlarmState("buy", false, buyCondition.expected);
        return;
    }

    byId("ask-value").innerText = ask;

    byId("bid-value").innerText = bid;

    byId("buy-spread-value").innerText = buyCondition.spread;

    byId("buy-return-value").innerText =
        buyCondition.buyReturn.toFixed(2);

    updateOptionAlarmState(
        "buy",
        buyCondition.isHit,
        buyCondition.expected
    );

    if (buyCondition.isHit) {
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

    const offsetCondition = getOffsetConditionState(
        bidA,
        askB
    );

    byId("sell-bid-a-value").innerText = bidA;
    byId("sell-ask-b-value").innerText = askB;
    byId("sell-spread-value").innerText = offsetCondition.spread;

    if (offsetCondition.offsetReturn === null) {
        updateOptionAlarmState(
            "offset",
            false,
            offsetCondition.expected
        );
        return;
    }

    byId("sell-return-value").innerText =
        offsetCondition.offsetReturn.toFixed(2);

    updateOptionAlarmState(
        "offset",
        offsetCondition.isHit,
        offsetCondition.expected
    );

    if (offsetCondition.isHit) {
        byId("sell-return-row").classList.add("return-hit");
    }
}



function startOptionMonitoring(showMissingSymbolsMessage = true) {

    clearInterval(optionTimer);
    optionTimer = null;
    resetOptionAlarmStates();

    refreshOptionSymbols(false).catch(error => {
        byId("option-symbols-status").innerText = error.message;
    });

    if (!byId("opt-symbol-a").value || !byId("opt-symbol-b").value) {
        if (showMissingSymbolsMessage) {
            byId("option-symbols-status").innerText =
                "برای شروع مانیتورینگ، نماد A و نماد B را انتخاب کنید.";
        }

        setMonitoringState(false);
        return;
    }

    setMonitoringState(true);

    optionTimer = setInterval(async () => {

        if (brokerAdapter.refreshOptionMarketData) {
            await brokerAdapter.refreshOptionMarketData()
                .catch(error => {
                    byId("option-symbols-status").innerText = error.message;
                });
        }

        const ask = getAskA();
        const bid = getBidB();
        const bidA = getBidA();
        const askB = getAskB();

        if (ask !== null && ask !== undefined && bid !== null && bid !== undefined) {
            checkBuyCondition(
                ask,
                bid
            );
        } else {
            updateOptionAlarmState("buy", false);
        }

        if (bidA !== null && bidA !== undefined && askB !== null && askB !== undefined) {
            checkSellCondition(
                bidA,
                askB
            );
        } else {
            updateOptionAlarmState("offset", false);
        }

    }, 1000);
}

function startOptionMonitoringIfReady() {

    if (optionTimer)
        return;

    if (!byId("opt-symbol-a").value || !byId("opt-symbol-b").value)
        return;

    startOptionMonitoring(false);
}

loadOptionPreferences();
bindOptionPreferencePersistence();
bindSyncedQuantityInputs("opt-buy-quantity", "opt-buy-sell-quantity");
bindSyncedQuantityInputs("opt-offset-buy-quantity", "opt-sell-quantity");
syncOrderQuantityPairs();
syncOptionAlarmControlsVisibility();

byId("opt-start").onclick = () => startOptionMonitoring();

byId("opt-stop")
    .onclick = () => {

        clearInterval(optionTimer);
        optionTimer = null;
        resetOptionAlarmStates();
        setMonitoringState(false);

    };

byId("opt-symbol-a").onchange = async () => {

    await refreshOptionStrategies();
    syncInitialPositionButtonVisibility();
    updateAutoOptionValues().catch(error => {
        byId("option-symbols-status").innerText = error.message;
    });
    startOptionMonitoringIfReady();
};
byId("opt-symbol-b").onchange = async () => {

    await refreshOptionStrategies();
    syncInitialPositionButtonVisibility();
    updateAutoOptionValues().catch(error => {
        byId("option-symbols-status").innerText = error.message;
    });
    startOptionMonitoringIfReady();
};
byId("opt-settings-toggle").onclick = () => {

    const body = byId("opt-settings-body");
    const isOpening = body.hidden;

    body.hidden = !isOpening;
    byId("opt-settings-toggle").innerText = isOpening ? "-" : "+";
    localStorage.setItem(
        getOptionPreferenceKey("opt-settings-open"),
        String(isOpening)
    );
};
byId("opt-auto-values").onchange = updateAutoOptionValues;
byId("opt-auto-buy-buttons").onchange = syncInitialPositionButtonVisibility;
byId("opt-sync-order-quantities").onchange = syncOrderQuantityPairs;
byId("opt-alarm-enabled").onchange = () => {

    resetOptionAlarmStates();
    syncOptionAlarmControlsVisibility();
};
byId("opt-alarm-count").onchange = resetOptionAlarmStates;
byId("opt-alarm-interval").onchange = resetOptionAlarmStates;
byId("opt-settings-reset").onclick = resetOptionPreferences;
byId("opt-stop-execution").onclick = () => {

    optionExecutionStopRequested = true;
    byId("opt-execution-progress").innerText = "در حال توقف...";
    byId("opt-stop-execution").disabled = true;
};
byId("opt-buy-order").onclick = sendOptionBuyOrder;
byId("opt-initial-position-order").onclick = sendInitialOptionPositionOrder;
byId("opt-stop-offset-execution").onclick = () => {

    optionOffsetExecutionStopRequested = true;
    byId("opt-offset-execution-progress").innerText = "در حال توقف...";
    byId("opt-stop-offset-execution").disabled = true;
};
byId("opt-sell-order").onclick = sendOptionOffsetOrder;

syncInitialPositionButtonVisibility();

function getAskA() {

    return brokerAdapter.getOptionQuote(
        byId("opt-symbol-a").value
    )?.ask;
}

function getBidB() {

    return brokerAdapter.getOptionQuote(
        byId("opt-symbol-b").value
    )?.bid;
}

function getBidA() {

    return brokerAdapter.getOptionQuote(
        byId("opt-symbol-a").value
    )?.bid;
}

function getAskB() {

    return brokerAdapter.getOptionQuote(
        byId("opt-symbol-b").value
    )?.ask;
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

refreshOptionSymbols().catch(error => {
    byId("option-symbols-status").innerText = error.message;
});
refreshOptionStrategies().catch(error => {
    byId("option-symbols-status").innerText = error.message;
});
updateAutoOptionValues().catch(error => {
    byId("option-symbols-status").innerText = error.message;
});
syncInitialPositionButtonVisibility();
setInterval(() => {
    refreshOptionSymbols().catch(error => {
        byId("option-symbols-status").innerText = error.message;
    });
}, 2000);
setInterval(() => {
    refreshOptionStrategies().catch(error => {
        byId("option-symbols-status").innerText = error.message;
    });
}, 2000);
setInterval(() => {
    updateAutoOptionValues().catch(error => {
        byId("option-symbols-status").innerText = error.message;
    });
    syncInitialPositionButtonVisibility();
}, 2000);
/*---------------------------------------------------------------------*/
