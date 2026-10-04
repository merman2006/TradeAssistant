
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
            const bidQuantity = container?.querySelector(
                'client-instrument-price-position-row[orderside="Buy"] .-is-quantity .-is-clickable'
            );
            const askQuantity = container?.querySelector(
                'client-instrument-price-position-row[orderside="Sell"] .-is-quantity .-is-clickable'
            );

            return {
                bid: parseOptionNumber(bid?.innerText),
                ask: parseOptionNumber(ask?.innerText),
                bidQuantity: parseOptionNumber(bidQuantity?.innerText),
                askQuantity: parseOptionNumber(askQuantity?.innerText)
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

let activePairRoot = null;
const byId = id =>
    activePairRoot?.querySelector(`#${id}`) || root.getElementById(id);
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
    .onclick = event => {

        event.preventDefault();
        event.stopPropagation();

        const current =
            root.querySelector(".ppt-content.active");

        if (!current) return;

        current.classList.toggle("minimized");
        byId("ppt-panel").classList.toggle(
            "minimized",
            current.classList.contains("minimized")
        );
        byId("ppt-minimize").innerText = current.classList.contains("minimized")
            ? "+"
            : "—";
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

    let startOffsetX = 0;
    let startOffsetY = 0;

    const positionStorageKey = "ppt-panel-position:v2";
    let offsetX = 0;
    let offsetY = 0;

    try {
        const savedPosition = JSON.parse(
            localStorage.getItem(positionStorageKey) || "null"
        );

        if (Number.isFinite(savedPosition?.x))
            offsetX = savedPosition.x;

        if (Number.isFinite(savedPosition?.y))
            offsetY = savedPosition.y;
    } catch (_) {}

    panel.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    header.addEventListener("mousedown", e => {

        dragging = true;

        startX = e.clientX;
        startY = e.clientY;

        startOffsetX = offsetX;
        startOffsetY = offsetY;
    });

    document.addEventListener("mousemove", e => {

        if (!dragging) return;

        offsetX = startOffsetX + (e.clientX - startX);
        offsetY = startOffsetY + (e.clientY - startY);

        panel.style.transform =
            `translate(${offsetX}px, ${offsetY}px)`;
    });

    document.addEventListener("mouseup", () => {

        dragging = false;

        localStorage.setItem(
            positionStorageKey,
            JSON.stringify({ x: offsetX, y: offsetY })
        );
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
let optionAlarmStates = {
    buy: { isHit: false, signature: null },
    offset: { isHit: false, signature: null }
};
const OPTION_PREFERENCES_STORAGE_PREFIX = "ppt-option-preference:";
const OPTION_PERSISTED_FIELDS = [
    { id: "opt-auto-values", type: "checkbox" },
    { id: "opt-auto-buy-buttons", type: "checkbox" },
    { id: "opt-sync-order-quantities", type: "checkbox" },
    { id: "opt-limit-order-quantity-to-queue", type: "checkbox" },
    { id: "opt-verify-buy-position", type: "checkbox" },
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
const OPTION_BUY_POSITION_LABEL = "موقعیت خرید";
const OPTION_SELL_POSITION_LABEL = "موقعیت فروش";
const OPTION_POSITION_READ_TIMEOUT_MS = 5000;
const OPTION_BUY_VERIFICATION_TIMEOUT_MS = 20000;
const OPTION_BUY_VERIFICATION_POLL_MS = 500;
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
        `.ag-center-cols-container [row-id="${escapeSelectorValue(instrumentId)}"]`
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

function getOptionPositionColumnId(label) {

    const normalizedLabel = normalizeDomText(label)
        .replace(/[\u200c\u200f]/g, "")
        .replace(/ي/g, "ی")
        .replace(/ك/g, "ک");
    const header = Array
        .from(document.querySelectorAll(
            ".ag-header [col-id], .ag-header-cell[col-id], [role=columnheader][col-id]"
        ))
        .find(cell => normalizeDomText(cell.innerText)
            .replace(/[\u200c\u200f]/g, "")
            .replace(/ي/g, "ی")
            .replace(/ك/g, "ک")
            .includes(normalizedLabel));

    return header?.getAttribute("col-id") || null;
}

function readOptionPositionQuantity(instrumentId, label) {

    const columnId = getOptionPositionColumnId(label);

    if (!columnId)
        return null;

    const row = getOptionPositionRow(instrumentId);

    // Once the grid and its column are present, a missing instrument row
    // represents zero position for that instrument.
    if (!row)
        return 0;

    const cell = row.querySelector(`[col-id="${escapeSelectorValue(columnId)}"]`);

    if (!cell)
        return null;

    const quantity = parseOptionNumber(cell.innerText);

    if (quantity !== null)
        return quantity;

    // The broker renders an empty position as a dash in some grid rows.
    return /^[-–—]?$/.test(normalizeDomText(cell.innerText))
        ? 0
        : null;
}

async function waitForOptionPositionQuantity(instrumentId, label) {

    ensureOptionPositionsTabLoaded();

    const deadline = Date.now() + OPTION_POSITION_READ_TIMEOUT_MS;

    while (Date.now() <= deadline) {
        const quantity = readOptionPositionQuantity(instrumentId, label);

        if (quantity !== null)
            return quantity;

        await delay(OPTION_BUY_VERIFICATION_POLL_MS);
    }

    return null;
}

function isOptionBuyPositionVerificationEnabled() {

    return !!byId("opt-verify-buy-position")?.checked;
}

async function verifyOptionBuyFromPositions({
    instrumentId,
    quantity,
    positionBefore,
    positionLabel = OPTION_BUY_POSITION_LABEL,
    expectedDirection = "increase",
    isStopRequested,
    progress
}) {

    const deadline = Date.now() + OPTION_BUY_VERIFICATION_TIMEOUT_MS;
    let filledQuantity = 0;

    while (Date.now() <= deadline) {
        if (isStopRequested()) {
            return { executed: false, stopped: true, filledQuantity };
        }

        const currentPosition = readOptionPositionQuantity(
            instrumentId,
            positionLabel
        );

        if (currentPosition !== null) {
            filledQuantity = Math.max(
                0,
                expectedDirection === "decrease"
                    ? positionBefore - currentPosition
                    : currentPosition - positionBefore
            );

            if (filledQuantity >= quantity)
                return { executed: true, filledQuantity };

            progress.innerText =
                `در حال بررسی ${positionLabel} (${filledQuantity} از ${quantity})...`;
        }

        await delay(OPTION_BUY_VERIFICATION_POLL_MS);
    }

    return { executed: false, stopped: false, filledQuantity };
}

async function cancelTimedOutOptionOrder(orderResponse, progress) {

    if (typeof brokerAdapter.cancelOptionOrder !== "function") {
        throw new Error(
            "لغو خودکار سفارش برای این کارگزاری پشتیبانی نمی‌شود."
        );
    }

    progress.innerText = "در حال لغو مانده سفارش خرید...";
    return brokerAdapter.cancelOptionOrder(orderResponse);
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

        if (
            values?.premium !== null &&
            values?.premium !== undefined &&
            values?.maxValue !== null &&
            values?.maxValue !== undefined
        ) {
            return;
        }
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

function isOrderQuantityLimitedToQueue() {

    return !!byId("opt-limit-order-quantity-to-queue")?.checked;
}

function getQueueOrderQuantities({
    buyQuantity,
    sellQuantity,
    availableBuyQuantity,
    availableSellQuantity
}) {

    const defaultQuantities = {
        buyQuantity,
        sellQuantity,
        isQueueLimited: false
    };

    // Separate quantities can encode an intentional leg ratio.  In that case
    // preserve the user's configured quantities exactly.
    if (
        !isOrderQuantityLimitedToQueue() ||
        buyQuantity !== sellQuantity ||
        buyQuantity <= 0
    ) {
        return defaultQuantities;
    }

    if (
        availableBuyQuantity === null ||
        availableBuyQuantity === undefined ||
        availableSellQuantity === null ||
        availableSellQuantity === undefined
    ) {
        return defaultQuantities;
    }

    const buyAvailable = Number(availableBuyQuantity);
    const sellAvailable = Number(availableSellQuantity);

    if (
        !Number.isInteger(buyAvailable) ||
        buyAvailable < 0 ||
        !Number.isInteger(sellAvailable) ||
        sellAvailable < 0
    ) {
        // A broker that does not expose top-of-book volume keeps the existing
        // behavior rather than guessing a safe volume.
        return defaultQuantities;
    }

    const matchedQuantity = Math.min(
        buyQuantity,
        buyAvailable,
        sellAvailable
    );

    return {
        buyQuantity: matchedQuantity,
        sellQuantity: matchedQuantity,
        isQueueLimited: matchedQuantity < buyQuantity
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

            const quoteA = brokerAdapter.getOptionQuote(instrumentIdA);
            const quoteB = brokerAdapter.getOptionQuote(instrumentIdB);
            const askA = quoteA?.ask;
            const bidB = quoteB?.bid;

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

            const queueOrderQuantities = getQueueOrderQuantities({
                buyQuantity: buyQuantityA,
                sellQuantity: sellQuantityB,
                availableBuyQuantity: quoteA?.askQuantity,
                availableSellQuantity: quoteB?.bidQuantity
            });
            const buyQuantityForStep = queueOrderQuantities.buyQuantity;
            const sellQuantityForStepBase = queueOrderQuantities.sellQuantity;

            if (buyQuantityForStep === 0 && sellQuantityForStepBase === 0) {
                status.innerText =
                    "حجم سرخط خرید یا فروش برای اجرای این زوج کافی نیست.";
                return;
            }

            let result = null;
            let buyPositionBefore = null;

            if (buyQuantityForStep > 0) {
                if (isOptionBuyPositionVerificationEnabled()) {
                    progress.innerText = "در حال دریافت موقعیت خرید A...";
                    buyPositionBefore = await waitForOptionPositionQuantity(
                        instrumentIdA,
                        OPTION_BUY_POSITION_LABEL
                    );

                    if (buyPositionBefore === null) {
                        status.innerText =
                            "موقعیت خرید A از تب موقعیت‌های اختیار قابل خواندن نیست؛ برای جلوگیری از فروش بدون خرید، سفارش ارسال نشد.";
                        return;
                    }

                    if (optionExecutionStopRequested) {
                        status.innerText = "اجرای سفارش پیش از ثبت خرید متوقف شد.";
                        return;
                    }
                }

                progress.innerText =
                    `در حال ثبت خرید ${step}/${executionCount}...`;

                const orderResult = await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdA,
                    side: "Buy",
                    price: askA,
                    quantity: buyQuantityForStep,
                    strategyKey: optionStrategyUniqueKey
                });

                result = orderResult.json;
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    buyQuantityForStep > 0
                        ? "سفارش خرید ثبت شد؛ ادامه اجرا قبل از ارسال فروش متوقف شد."
                        : "ادامه اجرا قبل از ارسال فروش متوقف شد.";
                return;
            }

            let buyExecuted = true;
            let sellQuantityForStep = sellQuantityForStepBase;
            let partialBuyFilledQuantity = 0;

            if (buyQuantityForStep > 0) {
                status.innerText = "در حال بررسی انجام شدن خرید نماد A...";

                if (isOptionBuyPositionVerificationEnabled()) {
                    const verification = await verifyOptionBuyFromPositions({
                        instrumentId: instrumentIdA,
                        quantity: buyQuantityForStep,
                        positionBefore: buyPositionBefore,
                        isStopRequested: () => optionExecutionStopRequested,
                        progress
                    });

                    buyExecuted = verification.executed;

                    if (!buyExecuted) {
                        let filledQuantityAfterCancellation =
                            verification.filledQuantity;

                        if (!verification.stopped) {
                            const cancellationResult =
                                await cancelTimedOutOptionOrder(result, progress);

                            if (Number.isInteger(cancellationResult?.executedQuantity)) {
                                filledQuantityAfterCancellation = Math.max(
                                    filledQuantityAfterCancellation,
                                    cancellationResult.executedQuantity
                                );
                            }
                        }

                        if (!verification.stopped && filledQuantityAfterCancellation >= buyQuantityForStep) {
                            buyExecuted = true;
                        } else if (!verification.stopped && filledQuantityAfterCancellation > 0) {
                            partialBuyFilledQuantity = filledQuantityAfterCancellation;
                            sellQuantityForStep = Math.min(
                                sellQuantityForStepBase,
                                partialBuyFilledQuantity
                            );
                            buyExecuted = true;
                            status.innerText =
                                `خرید A فقط ${partialBuyFilledQuantity} از ${buyQuantityForStep} انجام شد؛ مانده سفارش لغو شد و فروش B به تعداد ${sellQuantityForStep} ارسال می‌شود.`;
                        } else {
                            status.innerText = verification.stopped
                                ? "سفارش خرید A ثبت شد؛ ادامه اجرا هنگام بررسی موقعیت متوقف شد و فروش B ارسال نشد."
                                : "افزایش موقعیت خرید A تأیید نشد؛ مانده سفارش لغو شد و فروش B ارسال نشد.";
                        }
                    }
                } else {
                    buyExecuted = await isOptionBuyOrderExecuted({
                        instrumentId: instrumentIdA,
                        price: askA,
                        quantity: buyQuantityForStep,
                        orderResponse: result
                    });
                }
            }

            if (!buyExecuted) {
                if (!status.innerText) {
                    status.innerText =
                        "سفارش خرید A ثبت شد؛ فروش B ارسال نشد.";
                }
                return;
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    buyQuantityForStep > 0
                        ? "سفارش خرید انجام شد؛ ادامه اجرا قبل از ارسال فروش متوقف شد."
                        : "ادامه اجرا قبل از ارسال فروش متوقف شد.";
                return;
            }

            const latestBidB = getBidB();

            if (sellQuantityForStep > 0 && !latestBidB) {
                throw new Error("قیمت سرخط خرید نماد B پیدا نشد.");
            }

            if (sellQuantityForStep > 0) {
                progress.innerText =
                    `در حال ثبت فروش ${step}/${executionCount}...`;

                await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdB,
                    side: "Sell",
                    price: latestBidB,
                    quantity: sellQuantityForStep,
                    strategyKey: optionStrategyUniqueKey
                });
            }

            completedCount++;
            status.innerText =
                `${completedCount} از ${executionCount} اجرا انجام شد.`;

            if (partialBuyFilledQuantity > 0) {
                status.innerText =
                    `خرید A به‌صورت جزئی (${partialBuyFilledQuantity}) انجام شد و فروش B به تعداد ${sellQuantityForStep} ارسال شد؛ ادامه اجرا متوقف شد. مانده سفارش خرید A را بررسی کنید.`;
                return;
            }

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

            const quoteA = brokerAdapter.getOptionQuote(instrumentIdA);
            const quoteB = brokerAdapter.getOptionQuote(instrumentIdB);
            const askA = quoteA?.ask;
            const bidB = quoteB?.bid;

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

            const queueOrderQuantities = getQueueOrderQuantities({
                buyQuantity: buyQuantityA,
                sellQuantity: sellQuantityB,
                availableBuyQuantity: quoteA?.askQuantity,
                availableSellQuantity: quoteB?.bidQuantity
            });
            const buyQuantityForStep = queueOrderQuantities.buyQuantity;
            const sellQuantityForStepBase = queueOrderQuantities.sellQuantity;

            if (buyQuantityForStep === 0 && sellQuantityForStepBase === 0) {
                status.innerText =
                    "حجم سرخط خرید یا فروش برای اجرای موقعیت اول کافی نیست.";
                return;
            }

            let buyResult = null;
            let buyPositionBefore = null;

            if (buyQuantityForStep > 0) {
                if (isOptionBuyPositionVerificationEnabled()) {
                    progress.innerText = "در حال دریافت موقعیت خرید A...";
                    buyPositionBefore = await waitForOptionPositionQuantity(
                        instrumentIdA,
                        OPTION_BUY_POSITION_LABEL
                    );

                    if (buyPositionBefore === null) {
                        status.innerText =
                            "موقعیت خرید A از تب موقعیت‌های اختیار قابل خواندن نیست؛ برای جلوگیری از فروش بدون خرید، سفارش ارسال نشد.";
                        return;
                    }

                    if (optionExecutionStopRequested) {
                        status.innerText = "اجرای موقعیت اول پیش از ثبت خرید متوقف شد.";
                        return;
                    }
                }

                progress.innerText =
                    `در حال ثبت خرید اولیه ${step}/${executionCount}...`;

                const orderResult = await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdA,
                    side: "Buy",
                    price: askA,
                    quantity: buyQuantityForStep,
                    strategyKey: null
                });

                buyResult = orderResult.json;
            }

            if (optionExecutionStopRequested) {
                status.innerText =
                    buyQuantityForStep > 0
                        ? "سفارش خرید اولیه ثبت شد؛ ادامه قبل از ساخت استراتژی متوقف شد."
                        : "ادامه قبل از ساخت استراتژی متوقف شد.";
                return;
            }

            let buyExecuted = true;
            let sellQuantityForStep = sellQuantityForStepBase;
            let partialBuyFilledQuantity = 0;

            if (buyQuantityForStep > 0) {
                status.innerText = "در حال بررسی انجام شدن خرید اولیه...";

                if (isOptionBuyPositionVerificationEnabled()) {
                    const verification = await verifyOptionBuyFromPositions({
                        instrumentId: instrumentIdA,
                        quantity: buyQuantityForStep,
                        positionBefore: buyPositionBefore,
                        isStopRequested: () => optionExecutionStopRequested,
                        progress
                    });

                    buyExecuted = verification.executed;

                    if (!buyExecuted) {
                        let filledQuantityAfterCancellation =
                            verification.filledQuantity;

                        if (!verification.stopped) {
                            const cancellationResult =
                                await cancelTimedOutOptionOrder(buyResult, progress);

                            if (Number.isInteger(cancellationResult?.executedQuantity)) {
                                filledQuantityAfterCancellation = Math.max(
                                    filledQuantityAfterCancellation,
                                    cancellationResult.executedQuantity
                                );
                            }
                        }

                        if (!verification.stopped && filledQuantityAfterCancellation >= buyQuantityForStep) {
                            buyExecuted = true;
                        } else if (!verification.stopped && filledQuantityAfterCancellation > 0) {
                            partialBuyFilledQuantity = filledQuantityAfterCancellation;
                            sellQuantityForStep = Math.min(
                                sellQuantityForStepBase,
                                partialBuyFilledQuantity
                            );
                            buyExecuted = true;
                            status.innerText =
                                `خرید اولیه فقط ${partialBuyFilledQuantity} از ${buyQuantityForStep} انجام شد؛ مانده سفارش لغو شد و فروش B به تعداد ${sellQuantityForStep} ارسال می‌شود.`;
                        } else {
                            status.innerText = verification.stopped
                                ? "سفارش خرید اولیه ثبت شد؛ ادامه هنگام بررسی موقعیت متوقف شد و فروش انجام نشد."
                                : "افزایش موقعیت خرید A تأیید نشد؛ مانده سفارش لغو شد و فروش انجام نشد.";
                        }
                    }
                } else {
                    buyExecuted = await isOptionBuyOrderExecuted({
                        instrumentId: instrumentIdA,
                        price: askA,
                        quantity: buyQuantityForStep,
                        orderResponse: buyResult
                    });
                }
            }

            if (!buyExecuted) {
                if (!status.innerText) {
                    status.innerText =
                        "سفارش خرید اولیه ثبت شد؛ تا انجام شدن خرید، ساخت استراتژی و فروش انجام نشد.";
                }
                return;
            }

            progress.innerText =
                `در حال ساخت استراتژی ${step}/${executionCount}...`;

            const strategyKey = await createInitialOptionStrategy({
                instrumentIdA,
                instrumentIdB,
                quantity: partialBuyFilledQuantity || buyQuantityForStep || sellQuantityForStepBase,
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

            if (sellQuantityForStep > 0 && !latestBidB) {
                throw new Error("قیمت سرخط خرید نماد B پیدا نشد.");
            }

            if (sellQuantityForStep > 0) {
                progress.innerText =
                    `در حال ثبت فروش ${step}/${executionCount}...`;

                await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdB,
                    side: "Sell",
                    price: latestBidB,
                    quantity: sellQuantityForStep,
                    strategyKey
                });
            }

            completedCount++;
            status.innerText =
                `${completedCount} از ${executionCount} اجرای موقعیت اول انجام شد.`;

            if (partialBuyFilledQuantity > 0) {
                status.innerText =
                    `خرید اولیه به‌صورت جزئی (${partialBuyFilledQuantity}) انجام شد و فروش B به تعداد ${sellQuantityForStep} ارسال شد؛ ادامه اجرا متوقف شد. مانده سفارش خرید A را بررسی کنید.`;
                return;
            }

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

            const quoteB = brokerAdapter.getOptionQuote(instrumentIdB);
            const quoteA = brokerAdapter.getOptionQuote(instrumentIdA);
            const askB = quoteB?.ask;
            const bidA = quoteA?.bid;

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

            const queueOrderQuantities = getQueueOrderQuantities({
                buyQuantity: buyQuantityB,
                sellQuantity: sellQuantityA,
                availableBuyQuantity: quoteB?.askQuantity,
                availableSellQuantity: quoteA?.bidQuantity
            });
            const buyQuantityForStep = queueOrderQuantities.buyQuantity;
            const sellQuantityForStepBase = queueOrderQuantities.sellQuantity;

            if (buyQuantityForStep === 0 && sellQuantityForStepBase === 0) {
                status.innerText =
                    "حجم سرخط خرید یا فروش برای اجرای آفست کافی نیست.";
                return;
            }

            let buyResult = null;
            let buyPositionBefore = null;

            if (buyQuantityForStep > 0) {
                if (isOptionBuyPositionVerificationEnabled()) {
                    progress.innerText = "در حال دریافت موقعیت فروش B...";
                    buyPositionBefore = await waitForOptionPositionQuantity(
                        instrumentIdB,
                        OPTION_SELL_POSITION_LABEL
                    );

                    if (buyPositionBefore === null) {
                        status.innerText =
                            "موقعیت فروش B از تب موقعیت‌های اختیار قابل خواندن نیست؛ برای جلوگیری از آفست ناقص، سفارش ارسال نشد.";
                        return;
                    }

                    if (optionOffsetExecutionStopRequested) {
                        status.innerText = "اجرای آفست پیش از ثبت خرید متوقف شد.";
                        return;
                    }
                }

                progress.innerText =
                    `در حال ثبت خرید B ${step}/${executionCount}...`;

                const orderResult = await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdB,
                    side: "Buy",
                    price: askB,
                    quantity: buyQuantityForStep,
                    strategyKey: optionStrategyUniqueKey
                });

                buyResult = orderResult.json;
            }

            if (optionOffsetExecutionStopRequested) {
                status.innerText =
                    buyQuantityForStep > 0
                        ? "سفارش خرید B ثبت شد؛ ادامه آفست قبل از ارسال فروش A متوقف شد."
                        : "ادامه آفست قبل از ارسال فروش A متوقف شد.";
                return;
            }

            let buyExecuted = true;
            let sellQuantityForStep = sellQuantityForStepBase;
            let partialBuyFilledQuantity = 0;

            if (buyQuantityForStep > 0) {
                status.innerText = "در حال بررسی انجام شدن خرید نماد B...";

                if (isOptionBuyPositionVerificationEnabled()) {
                    const verification = await verifyOptionBuyFromPositions({
                        instrumentId: instrumentIdB,
                        quantity: buyQuantityForStep,
                        positionBefore: buyPositionBefore,
                        positionLabel: OPTION_SELL_POSITION_LABEL,
                        expectedDirection: "decrease",
                        isStopRequested: () => optionOffsetExecutionStopRequested,
                        progress
                    });

                    buyExecuted = verification.executed;

                    if (!buyExecuted) {
                        let filledQuantityAfterCancellation =
                            verification.filledQuantity;

                        if (!verification.stopped) {
                            const cancellationResult =
                                await cancelTimedOutOptionOrder(buyResult, progress);

                            if (Number.isInteger(cancellationResult?.executedQuantity)) {
                                filledQuantityAfterCancellation = Math.max(
                                    filledQuantityAfterCancellation,
                                    cancellationResult.executedQuantity
                                );
                            }
                        }

                        if (!verification.stopped && filledQuantityAfterCancellation >= buyQuantityForStep) {
                            buyExecuted = true;
                        } else if (!verification.stopped && filledQuantityAfterCancellation > 0) {
                            partialBuyFilledQuantity = filledQuantityAfterCancellation;
                            sellQuantityForStep = Math.min(
                                sellQuantityForStepBase,
                                partialBuyFilledQuantity
                            );
                            buyExecuted = true;
                            status.innerText =
                                `خرید B فقط ${partialBuyFilledQuantity} از ${buyQuantityForStep} انجام شد؛ مانده سفارش لغو شد و فروش A به تعداد ${sellQuantityForStep} ارسال می‌شود.`;
                        } else {
                            status.innerText = verification.stopped
                                ? "سفارش خرید B ثبت شد؛ ادامه آفست هنگام بررسی موقعیت متوقف شد و فروش A ارسال نشد."
                                : "کاهش موقعیت فروش B تأیید نشد؛ مانده سفارش لغو شد و فروش A ارسال نشد.";
                        }
                    }
                } else {
                    buyExecuted = await isOptionBuyOrderExecuted({
                        instrumentId: instrumentIdB,
                        price: askB,
                        quantity: buyQuantityForStep,
                        orderResponse: buyResult
                    });
                }
            }

            if (!buyExecuted) {
                if (!status.innerText) {
                    status.innerText =
                        "سفارش خرید B ثبت شد؛ فروش A ارسال نشد.";
                }
                return;
            }

            if (optionOffsetExecutionStopRequested) {
                status.innerText =
                    buyQuantityForStep > 0
                        ? "سفارش خرید B انجام شد؛ ادامه آفست قبل از ارسال فروش A متوقف شد."
                        : "ادامه آفست قبل از ارسال فروش A متوقف شد.";
                return;
            }

            const latestBidA = getBidA();

            if (sellQuantityForStep > 0 && !latestBidA) {
                throw new Error("قیمت سرخط خرید نماد A پیدا نشد.");
            }

            if (sellQuantityForStep > 0) {
                progress.innerText =
                    `در حال ثبت فروش A ${step}/${executionCount}...`;

                await brokerAdapter.placeOptionOrder({
                    instrumentId: instrumentIdA,
                    side: "Sell",
                    price: latestBidA,
                    quantity: sellQuantityForStep,
                    strategyKey: optionStrategyUniqueKey
                });
            }

            completedCount++;
            status.innerText =
                `${completedCount} از ${executionCount} اجرای آفست انجام شد.`;

            if (partialBuyFilledQuantity > 0) {
                status.innerText =
                    `خرید B به‌صورت جزئی (${partialBuyFilledQuantity}) انجام شد و فروش A به تعداد ${sellQuantityForStep} ارسال شد؛ ادامه آفست متوقف شد. مانده سفارش خرید B را بررسی کنید.`;
                return;
            }

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
    bid,
    askIsFallback = false,
    bidIsFallback = false
) {
    byId("buy-return-row").classList.remove("return-hit");

    const askElement = byId("ask-value");
    const bidElement = byId("bid-value");
    askElement.innerText = ask ?? "-";
    bidElement.innerText = bid ?? "-";
    askElement.classList.toggle("quote-fallback", askIsFallback);
    bidElement.classList.toggle("quote-fallback", bidIsFallback);

    const buyCondition = getBuyConditionState(ask, bid);

    if (buyCondition.spread <= 0) {
        updateOptionAlarmState("buy", false, buyCondition.expected);
        return;
    }

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
    askB,
    bidAIsFallback = false,
    askBIsFallback = false
) {
    byId("sell-return-row").classList.remove("return-hit");

    const bidAElement = byId("sell-bid-a-value");
    const askBElement = byId("sell-ask-b-value");
    bidAElement.innerText = bidA ?? "-";
    askBElement.innerText = askB ?? "-";
    bidAElement.classList.toggle("quote-fallback", bidAIsFallback);
    askBElement.classList.toggle("quote-fallback", askBIsFallback);

    const offsetCondition = getOffsetConditionState(
        bidA,
        askB
    );

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

if (false) {
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
}

/* Multi-pair option UI -------------------------------------------------- */
const PAIRS_STORAGE_KEY = "ppt-option-pairs:v1";
const GLOBAL_STORAGE_KEY = "ppt-option-global-settings:v1";
let pairStates = [];
let pairTaskQueue = Promise.resolve();

function createPairState(source = {}) {
    return {
        id: source.id || `pair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        symbolA: source.symbolA || "", symbolB: source.symbolB || "", strategyKey: source.strategyKey || "",
        quantities: { openBuyA: source.quantities?.openBuyA ?? 10, openSellB: source.quantities?.openSellB ?? 10, offsetBuyB: source.quantities?.offsetBuyB ?? 10, offsetSellA: source.quantities?.offsetSellA ?? 10 },
        values: { maxValue: source.values?.maxValue ?? "", premium: source.values?.premium ?? "", expectedReturn: source.values?.expectedReturn ?? "", expectedOffsetReturn: source.values?.expectedOffsetReturn ?? "" },
        executionCount: source.executionCount || 1,
        offsetExecutionCount: source.offsetExecutionCount || 1,
        auto: {
            open: {
                maxBuy: source.auto?.open?.maxBuy ?? 0,
                maxDifference: source.auto?.open?.maxDifference ?? 0,
                intervalMs: source.auto?.open?.intervalMs ?? 1000,
                enabled: false,
                executing: false,
                nextAllowedAt: 0,
                blockedReason: ""
            },
            offset: {
                minBuy: source.auto?.offset?.minBuy ?? 0,
                maxDifference: source.auto?.offset?.maxDifference ?? 0,
                intervalMs: source.auto?.offset?.intervalMs ?? 1000,
                enabled: false,
                executing: false,
                nextAllowedAt: 0,
                blockedReason: ""
            }
        },
        alarm: { buy: { isHit: false, signature: null }, offset: { isHit: false, signature: null } },
        openStopRequested: false, offsetStopRequested: false
    };
}

function savePairs() { localStorage.setItem(PAIRS_STORAGE_KEY, JSON.stringify(pairStates.map(pair => ({ id: pair.id, symbolA: pair.symbolA, symbolB: pair.symbolB, strategyKey: pair.strategyKey, quantities: pair.quantities, values: pair.values, executionCount: pair.executionCount, offsetExecutionCount: pair.offsetExecutionCount, auto: { open: { maxBuy: pair.auto.open.maxBuy, maxDifference: pair.auto.open.maxDifference, intervalMs: pair.auto.open.intervalMs }, offset: { minBuy: pair.auto.offset.minBuy, maxDifference: pair.auto.offset.maxDifference, intervalMs: pair.auto.offset.intervalMs } } })))); }
function loadPairs() { try { const saved = JSON.parse(localStorage.getItem(PAIRS_STORAGE_KEY) || "null"); pairStates = Array.isArray(saved) && saved.length ? saved.map(createPairState) : [createPairState()]; } catch (_) { pairStates = [createPairState()]; } }
function saveGlobalSettings() { const ids = ["opt-auto-values", "opt-auto-buy-buttons", "opt-sync-order-quantities", "opt-limit-order-quantity-to-queue", "opt-verify-buy-position", "opt-alarm-enabled"]; const values = Object.fromEntries(ids.map(id => [id, byId(id)?.checked])); ["opt-alarm-count", "opt-alarm-interval"].forEach(id => values[id] = byId(id)?.value); values["opt-settings-open"] = !byId("opt-settings-body")?.hidden; localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(values)); }
function loadGlobalSettings() { let values = {}; try { values = JSON.parse(localStorage.getItem(GLOBAL_STORAGE_KEY) || "{}"); } catch (_) {} ["opt-auto-values", "opt-auto-buy-buttons", "opt-sync-order-quantities", "opt-limit-order-quantity-to-queue", "opt-verify-buy-position", "opt-alarm-enabled"].forEach(id => { if (typeof values[id] === "boolean") byId(id).checked = values[id]; }); ["opt-alarm-count", "opt-alarm-interval"].forEach(id => { if (values[id] !== undefined) byId(id).value = values[id]; }); if (values["opt-settings-open"]) { byId("opt-settings-body").hidden = false; byId("opt-settings-toggle").innerText = "-"; } }
function getPairCard(pair) { return root.querySelector(`[data-pair-id="${CSS.escape(pair.id)}"]`); }
function pairElement(pair, id) { return getPairCard(pair)?.querySelector(`#${id}`); }
async function withPair(pair, task) {
    const run = pairTaskQueue.then(async () => {
        const oldRoot = activePairRoot, oldAlarm = optionAlarmStates;
        activePairRoot = getPairCard(pair);
        optionAlarmStates = pair.alarm;
        try { return await task(); }
        finally { activePairRoot = oldRoot; optionAlarmStates = oldAlarm; }
    });
    pairTaskQueue = run.catch(() => {});
    return run;
}

function renderPair(pair) {
    const card = byId("opt-pair-template").content.firstElementChild.cloneNode(true);
    card.dataset.pairId = pair.id;
    card.querySelector("#opt-symbol-a").value = pair.symbolA; card.querySelector("#opt-symbol-b").value = pair.symbolB;
    card.querySelector("#opt-buy-quantity").value = pair.quantities.openBuyA; card.querySelector("#opt-buy-sell-quantity").value = pair.quantities.openSellB;
    card.querySelector("#opt-offset-buy-quantity").value = pair.quantities.offsetBuyB; card.querySelector("#opt-sell-quantity").value = pair.quantities.offsetSellA; card.querySelector("#opt-buy-execution-count").value = pair.executionCount; card.querySelector("#opt-sell-execution-count").value = pair.offsetExecutionCount;
    card.querySelector("#opt-max-value").value = pair.values.maxValue; card.querySelector("#opt-premium").value = pair.values.premium; card.querySelector("#opt-expected-return").value = pair.values.expectedReturn; card.querySelector("#opt-expected-offset-return").value = pair.values.expectedOffsetReturn;
    card.querySelector("#opt-auto-open-max-buy").value = pair.auto.open.maxBuy;
    card.querySelector("#opt-auto-open-max-difference").value = pair.auto.open.maxDifference;
    card.querySelector("#opt-auto-open-interval").value = pair.auto.open.intervalMs;
    card.querySelector("#opt-auto-offset-min-buy").value = pair.auto.offset.minBuy;
    card.querySelector("#opt-auto-offset-max-difference").value = pair.auto.offset.maxDifference;
    card.querySelector("#opt-auto-offset-interval").value = pair.auto.offset.intervalMs;
    return card;
}
function renderAllPairs() { const container = byId("opt-pairs"); container.innerHTML = ""; pairStates.forEach(pair => container.appendChild(renderPair(pair))); bindPairEvents(); bindPairQuantitySync(); }
function fillPairSymbols(card, symbols) {
    const pair = pairStates.find(item => item.id === card.dataset.pairId);
    const pairIndex = Math.max(0, pairStates.indexOf(pair));
    ["opt-symbol-a", "opt-symbol-b"].forEach(id => {
        const select = card.querySelector(`#${id}`);
        const pairValue = id === "opt-symbol-a" ? pair?.symbolA : pair?.symbolB;
        const defaultIndex = pairIndex * 2 + (id === "opt-symbol-b" ? 1 : 0);
        const defaultSymbol = symbols[defaultIndex];
        const shouldUseIndexedDefault = !pairValue && defaultSymbol;
        select.innerHTML = "";
        symbols.forEach(symbol => {
            const option = document.createElement("option");
            option.value = symbol.instrumentId;
            option.innerText = symbol.title;
            select.appendChild(option);
        });
        if (shouldUseIndexedDefault) {
            select.value = defaultSymbol.instrumentId;
        } else if (pairValue && symbols.some(symbol => symbol.instrumentId === pairValue)) {
            select.value = pairValue;
        } else if (pairValue) {
            const missing = document.createElement("option");
            missing.value = pairValue;
            missing.innerText = `${pairValue} (در دیده‌بان پیدا نشد)`;
            select.appendChild(missing);
            select.value = pairValue;
        } else if (pairValue) {
            select.value = "";
        }
    });
}
async function refreshAllPairs() {
    const symbols = await brokerAdapter.getOptionSymbols();
    root.querySelectorAll("#opt-pairs .option-pair-card").forEach(card => fillPairSymbols(card, symbols));
    pairStates.forEach(pair => {
        pair.symbolA = pairElement(pair, "opt-symbol-a")?.value || pair.symbolA;
        pair.symbolB = pairElement(pair, "opt-symbol-b")?.value || pair.symbolB;
    });
    savePairs();
    await Promise.all(pairStates.map(pair => withPair(pair, async () => {
        optionStrategiesSignature = null;
        await refreshOptionStrategies();
        const strategy = pairElement(pair, "opt-strategy");
        if (pair.strategyKey && strategy && Array.from(strategy.options).some(option => option.value === pair.strategyKey)) strategy.value = pair.strategyKey;
        await updateAutoOptionValues();
        syncPairFromDom(pair);
        syncInitialPositionButtonVisibility();
    })));
}
function syncPairFromDom(pair) { pair.symbolA = pairElement(pair, "opt-symbol-a")?.value || ""; pair.symbolB = pairElement(pair, "opt-symbol-b")?.value || ""; pair.strategyKey = getSelectedOptionStrategyKey() || pair.strategyKey; pair.quantities.openBuyA = Number(pairElement(pair, "opt-buy-quantity")?.value || 0); pair.quantities.openSellB = Number(pairElement(pair, "opt-buy-sell-quantity")?.value || 0); pair.quantities.offsetBuyB = Number(pairElement(pair, "opt-offset-buy-quantity")?.value || 0); pair.quantities.offsetSellA = Number(pairElement(pair, "opt-sell-quantity")?.value || 0); pair.executionCount = Number(pairElement(pair, "opt-buy-execution-count")?.value || 1); pair.offsetExecutionCount = Number(pairElement(pair, "opt-sell-execution-count")?.value || 1); pair.values.maxValue = pairElement(pair, "opt-max-value")?.value || ""; pair.values.premium = pairElement(pair, "opt-premium")?.value || ""; pair.values.expectedReturn = pairElement(pair, "opt-expected-return")?.value || ""; pair.values.expectedOffsetReturn = pairElement(pair, "opt-expected-offset-return")?.value || ""; pair.auto.open.maxBuy = Number(pairElement(pair, "opt-auto-open-max-buy")?.value || 0); pair.auto.open.maxDifference = Number(pairElement(pair, "opt-auto-open-max-difference")?.value || 0); pair.auto.open.intervalMs = Number(pairElement(pair, "opt-auto-open-interval")?.value || 0); pair.auto.offset.minBuy = Number(pairElement(pair, "opt-auto-offset-min-buy")?.value || 0); pair.auto.offset.maxDifference = Number(pairElement(pair, "opt-auto-offset-max-difference")?.value || 0); pair.auto.offset.intervalMs = Number(pairElement(pair, "opt-auto-offset-interval")?.value || 0); savePairs(); }

function getMonitorQuote(preferred, fallback) {
    const preferredNumber = Number(preferred);
    const fallbackNumber = Number(fallback);

    if (Number.isFinite(preferredNumber) && preferredNumber > 0) {
        return { value: preferredNumber, isFallback: false };
    }

    if (Number.isFinite(fallbackNumber) && fallbackNumber > 0) {
        return { value: fallbackNumber, isFallback: true };
    }

    return { value: null, isFallback: false };
}

function getPairAutoDirectionState(pair, direction) {
    return pair.auto[direction];
}

function getPairAutoControlId(direction, name) {
    return `opt-auto-${direction}-${name}`;
}

function setPairAutoStatus(pair, direction, text, isRunning = false) {
    const status = pairElement(
        pair,
        getPairAutoControlId(direction, "status")
    );

    if (!status)
        return;

    status.innerText = text;
    status.title = text;
    status.classList.toggle("running", isRunning);
    status.classList.toggle(
        "blocked",
        !isRunning && text !== "فعال" && text !== "متوقف شد"
    );
}

function syncPairAutoControls(pair, direction) {
    const state = getPairAutoDirectionState(pair, direction);
    const start = pairElement(pair, getPairAutoControlId(direction, "start"));
    const stop = pairElement(pair, getPairAutoControlId(direction, "stop"));
    const toggle = getPairCard(pair)?.querySelector(
        `[data-action="toggle-auto-${direction}"]`
    );

    if (start)
        start.disabled = state.enabled;

    if (stop)
        stop.disabled = !state.enabled;

    toggle?.classList.toggle("auto-active", state.enabled);

    if (state.executing) {
        setPairAutoStatus(pair, direction, "در حال اجرا...", true);
    } else if (state.enabled) {
        setPairAutoStatus(
            pair,
            direction,
            state.blockedReason || "فعال",
            !state.blockedReason
        );
    }
}

function setPairAutoBlocked(pair, direction, reason) {
    const state = getPairAutoDirectionState(pair, direction);
    state.blockedReason = reason;
    setPairAutoStatus(pair, direction, reason);
}

function togglePairAutoControls(pair, direction) {
    const controls = getPairCard(pair)?.querySelector(
        `[data-auto-controls="${direction}"]`
    );
    const section = controls?.closest(".pair-monitor-section");

    if (!controls || !section)
        return;

    controls.hidden = !controls.hidden;
    section.classList.toggle("auto-controls-open", !controls.hidden);
}

async function readPairAutoPositions(pair) {
    const [buyPositionA, sellPositionB] = await Promise.all([
        waitForOptionPositionQuantity(
            pair.symbolA,
            OPTION_BUY_POSITION_LABEL
        ),
        waitForOptionPositionQuantity(
            pair.symbolB,
            OPTION_SELL_POSITION_LABEL
        )
    ]);

    return { buyPositionA, sellPositionB };
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}

async function canRunPairAutoOrder(pair, direction, showCheckingStatus = true) {
    const state = getPairAutoDirectionState(pair, direction);

    if (!pair.symbolA || !pair.symbolB) {
        setPairAutoBlocked(pair, direction, "نمادها ناقص‌اند");
        return false;
    }

    if (!isOptionBuyPositionVerificationEnabled()) {
        setPairAutoBlocked(pair, direction, "تأیید موقعیت غیرفعال است");
        return false;
    }

    if (
        !isNonNegativeInteger(state.maxDifference) ||
        !isNonNegativeInteger(state.intervalMs) ||
        (direction === "open" && (!isNonNegativeInteger(state.maxBuy) || state.maxBuy <= 0)) ||
        (direction === "offset" && !isNonNegativeInteger(state.minBuy))
    ) {
        setPairAutoBlocked(pair, direction, "اعداد تنظیمات نامعتبرند");
        return false;
    }

    if (showCheckingStatus) {
        setPairAutoStatus(pair, direction, "در حال بررسی موقعیت...", true);
    }
    const { buyPositionA, sellPositionB } = await readPairAutoPositions(pair);

    if (buyPositionA === null || sellPositionB === null) {
        setPairAutoBlocked(pair, direction, "موقعیت‌ها خوانده نشدند");
        return false;
    }

    if (direction === "open" && buyPositionA >= state.maxBuy) {
        setPairAutoBlocked(pair, direction, "سقف خرید رسیده؛ بازکردن انجام نشد.");
        return false;
    }

    const currentDifference = Math.abs(buyPositionA - sellPositionB);

    if (currentDifference > state.maxDifference) {
        setPairAutoBlocked(
            pair,
            direction,
            `اختلاف زیاد است؛ ${direction === "open" ? "بازکردن" : "آفست"} انجام نشد.`
        );
        return false;
    }

    const buyQuantity = direction === "open"
        ? pair.quantities.openBuyA
        : pair.quantities.offsetBuyB;
    const sellQuantity = direction === "open"
        ? pair.quantities.openSellB
        : pair.quantities.offsetSellA;

    if (!isNonNegativeInteger(buyQuantity) || !isNonNegativeInteger(sellQuantity)) {
        setPairAutoBlocked(pair, direction, "تعداد سفارش نامعتبر است");
        return false;
    }

    const projectedBuyPositionA = direction === "open"
        ? buyPositionA + buyQuantity
        : buyPositionA - sellQuantity;
    const projectedSellPositionB = direction === "open"
        ? sellPositionB + sellQuantity
        : sellPositionB - buyQuantity;

    if (projectedBuyPositionA < 0 || projectedSellPositionB < 0) {
        setPairAutoBlocked(pair, direction, "موقعیت کافی نیست");
        return false;
    }

    if (direction === "open" && projectedBuyPositionA > state.maxBuy) {
        setPairAutoBlocked(pair, direction, "اجرای بعدی از سقف خرید عبور می‌کند.");
        return false;
    }

    if (direction === "offset" && projectedBuyPositionA < state.minBuy) {
        setPairAutoBlocked(pair, direction, "حداقل خرید حفظ نمی‌شود؛ آفست انجام نشد.");
        return false;
    }

    if (
        Math.abs(projectedBuyPositionA - projectedSellPositionB) >
        state.maxDifference
    ) {
        setPairAutoBlocked(
            pair,
            direction,
            `اختلاف بعد از سفارش زیاد می‌شود؛ ${direction === "open" ? "بازکردن" : "آفست"} انجام نشد.`
        );
        return false;
    }

    state.blockedReason = "";
    return true;
}

function startPairAuto(pair, direction) {
    withPair(pair, async () => {
        syncPairFromDom(pair);
        const state = getPairAutoDirectionState(pair, direction);

        if (
            !isNonNegativeInteger(state.maxDifference) ||
            !isNonNegativeInteger(state.intervalMs) ||
            (direction === "open" && (!isNonNegativeInteger(state.maxBuy) || state.maxBuy <= 0)) ||
            (direction === "offset" && !isNonNegativeInteger(state.minBuy))
        ) {
            setPairAutoStatus(pair, direction, "اعداد تنظیمات نامعتبرند");
            return;
        }

        state.enabled = true;
        state.executing = false;
        state.nextAllowedAt = 0;
        state.blockedReason = "";
        syncPairAutoControls(pair, direction);
    }).catch(error => setPairAutoStatus(pair, direction, error.message));
}

function stopPairAuto(pair, direction) {
    const state = getPairAutoDirectionState(pair, direction);
    state.enabled = false;
    state.nextAllowedAt = Number.POSITIVE_INFINITY;
    state.blockedReason = "";
    syncPairAutoControls(pair, direction);
    setPairAutoStatus(pair, direction, "متوقف شد");
}

function requestPairAutoOrder(pair, direction, conditionIsHit) {
    const state = getPairAutoDirectionState(pair, direction);
    const otherDirectionState = getPairAutoDirectionState(
        pair,
        direction === "open" ? "offset" : "open"
    );
    const orderButtonId = direction === "open"
        ? "opt-buy-order"
        : "opt-sell-order";
    const orderButton = pairElement(pair, orderButtonId);

    if (
        !state.enabled ||
        state.executing ||
        otherDirectionState.executing ||
        Date.now() < state.nextAllowedAt ||
        orderButton?.disabled
    ) {
        return;
    }

    state.executing = true;
    syncPairAutoControls(pair, direction);

    withPair(
        pair,
        async () => canRunPairAutoOrder(pair, direction, conditionIsHit)
    )
        .then(canRun => {
            if (!canRun || !state.enabled || !conditionIsHit)
                return null;

            state.nextAllowedAt = Date.now() + state.intervalMs;
            setPairAutoStatus(pair, direction, "در حال ارسال سفارش...", true);

            // Invoke the existing button handler so manual and automatic
            // executions always share the same order, verification and
            // cancellation path.
            return orderButton.onclick?.();
        })
        .catch(error => setPairAutoStatus(pair, direction, error.message))
        .finally(() => {
            state.executing = false;
            syncPairAutoControls(pair, direction);
        });
}

async function updatePair(pair) {
    if (!pair.symbolA || !pair.symbolB) return;

    const conditions = await withPair(pair, async () => {
        if (brokerAdapter.refreshOptionMarketData) {
            await brokerAdapter.refreshOptionMarketData().catch(() => {});
        }

        const rawAskA = getAskA();
        const rawBidA = getBidA();
        const rawBidB = getBidB();
        const rawAskB = getAskB();

        const buyAsk = getMonitorQuote(rawAskA, rawBidA);
        const buyBid = getMonitorQuote(rawBidB, rawAskB);
        const offsetBid = getMonitorQuote(rawBidA, rawAskA);
        const offsetAsk = getMonitorQuote(rawAskB, rawBidB);

        let buyIsHit = false;
        let offsetIsHit = false;

        if (buyAsk.value != null && buyBid.value != null) {
            checkBuyCondition(
                buyAsk.value,
                buyBid.value,
                buyAsk.isFallback,
                buyBid.isFallback
            );
            buyIsHit = getBuyConditionState(
                buyAsk.value,
                buyBid.value
            ).isHit;
        } else {
            updateOptionAlarmState("buy", false);
        }

        if (offsetBid.value != null && offsetAsk.value != null) {
            checkSellCondition(
                offsetBid.value,
                offsetAsk.value,
                offsetBid.isFallback,
                offsetAsk.isFallback
            );
            offsetIsHit = getOffsetConditionState(
                offsetBid.value,
                offsetAsk.value
            ).isHit;
        } else {
            updateOptionAlarmState("offset", false);
        }

        return { buyIsHit, offsetIsHit };
    });

    requestPairAutoOrder(pair, "open", conditions?.buyIsHit);
    requestPairAutoOrder(pair, "offset", conditions?.offsetIsHit);
}
function bindPairEvents() {
    root.querySelectorAll("#opt-pairs .option-pair-card").forEach(card => {
        const pair = pairStates.find(item => item.id === card.dataset.pairId);

        if (!pair)
            return;

        [
            "opt-symbol-a", "opt-symbol-b", "opt-strategy",
            "opt-buy-quantity", "opt-buy-sell-quantity",
            "opt-offset-buy-quantity", "opt-sell-quantity",
            "opt-buy-execution-count", "opt-sell-execution-count",
            "opt-max-value", "opt-premium", "opt-expected-return",
            "opt-expected-offset-return"
        ].forEach(id => card.querySelector(`#${id}`).addEventListener(
            "change",
            () => withPair(pair, async () => {
                syncPairFromDom(pair);
                optionStrategiesSignature = null;
                await refreshOptionStrategies();
                await updateAutoOptionValues();
                syncPairFromDom(pair);
            })
        ));

        [
            "opt-auto-open-max-buy", "opt-auto-open-max-difference",
            "opt-auto-open-interval", "opt-auto-offset-min-buy",
            "opt-auto-offset-max-difference", "opt-auto-offset-interval"
        ].forEach(id => card.querySelector(`#${id}`).addEventListener(
            "change",
            () => withPair(pair, async () => syncPairFromDom(pair))
        ));

        card.querySelector('[data-action="remove-pair"]').onclick = () => {
            if (pairStates.length <= 1)
                return;

            stopPairAuto(pair, "open");
            stopPairAuto(pair, "offset");
            pairStates = pairStates.filter(item => item !== pair);
            renderAllPairs();
            savePairs();
        };

        card.querySelector("#opt-buy-order").onclick = () =>
            withPair(pair, sendOptionBuyOrder);
        card.querySelector("#opt-initial-position-order").onclick = () =>
            withPair(pair, sendInitialOptionPositionOrder);
        card.querySelector("#opt-sell-order").onclick = () =>
            withPair(pair, sendOptionOffsetOrder);
        card.querySelector("#opt-stop-execution").onclick = () => {
            optionExecutionStopRequested = true;
            pair.openStopRequested = true;
        };
        card.querySelector("#opt-stop-offset-execution").onclick = () => {
            optionOffsetExecutionStopRequested = true;
            pair.offsetStopRequested = true;
        };
        card.querySelector('[data-action="toggle-auto-open"]').onclick = () =>
            togglePairAutoControls(pair, "open");
        card.querySelector('[data-action="toggle-auto-offset"]').onclick = () =>
            togglePairAutoControls(pair, "offset");
        card.querySelector("#opt-auto-open-start").onclick = () =>
            startPairAuto(pair, "open");
        card.querySelector("#opt-auto-open-stop").onclick = () =>
            stopPairAuto(pair, "open");
        card.querySelector("#opt-auto-offset-start").onclick = () =>
            startPairAuto(pair, "offset");
        card.querySelector("#opt-auto-offset-stop").onclick = () =>
            stopPairAuto(pair, "offset");

        syncPairAutoControls(pair, "open");
        syncPairAutoControls(pair, "offset");
    });
}
function bindPairQuantitySync() {
    const quantityPairs = [
        ["opt-buy-quantity", "opt-buy-sell-quantity"],
        ["opt-offset-buy-quantity", "opt-sell-quantity"]
    ];

    root.querySelectorAll("#opt-pairs .option-pair-card").forEach(card => {
        const pair = pairStates.find(item => item.id === card.dataset.pairId);

        if (!pair)
            return;

        quantityPairs.forEach(([firstId, secondId]) => {
            const first = card.querySelector(`#${firstId}`);
            const second = card.querySelector(`#${secondId}`);

            if (byId("opt-sync-order-quantities")?.checked) {
                second.value = first.value;
            }

            first.addEventListener("input", () => {
                if (!byId("opt-sync-order-quantities")?.checked)
                    return;

                second.value = first.value;
                withPair(pair, async () => syncPairFromDom(pair));
            });

            second.addEventListener("input", () => {
                if (!byId("opt-sync-order-quantities")?.checked)
                    return;

                first.value = second.value;
                withPair(pair, async () => syncPairFromDom(pair));
            });
        });

        if (byId("opt-sync-order-quantities")?.checked) {
            withPair(pair, async () => syncPairFromDom(pair));
        }
    });
}

function syncAllPairQuantities() {
    if (!byId("opt-sync-order-quantities")?.checked)
        return;

    root.querySelectorAll("#opt-pairs .option-pair-card").forEach(card => {
        const pair = pairStates.find(item => item.id === card.dataset.pairId);

        if (!pair)
            return;

        [
            ["opt-buy-quantity", "opt-buy-sell-quantity"],
            ["opt-offset-buy-quantity", "opt-sell-quantity"]
        ].forEach(([firstId, secondId]) => {
            card.querySelector(`#${secondId}`).value =
                card.querySelector(`#${firstId}`).value;
        });

        withPair(pair, async () => syncPairFromDom(pair));
    });
}
function getActivePair() { return pairStates.find(pair => getPairCard(pair) === activePairRoot); }
function getAskA() { return brokerAdapter.getOptionQuote(pairElement(getActivePair(), "opt-symbol-a")?.value)?.ask; }
function getBidB() { return brokerAdapter.getOptionQuote(pairElement(getActivePair(), "opt-symbol-b")?.value)?.bid; }
function getBidA() { return brokerAdapter.getOptionQuote(pairElement(getActivePair(), "opt-symbol-a")?.value)?.bid; }
function getAskB() { return brokerAdapter.getOptionQuote(pairElement(getActivePair(), "opt-symbol-b")?.value)?.ask; }
function addPair() { pairStates.push(createPairState()); renderAllPairs(); savePairs(); refreshAllPairs().catch(showOptionError); }
function showOptionError(error) { byId("option-symbols-status").innerText = error.message; }

byId("opt-add-pair").onclick = addPair;
byId("opt-refresh-pairs").onclick = () => refreshAllPairs().catch(showOptionError);
byId("opt-settings-toggle").onclick = () => { const body = byId("opt-settings-body"); body.hidden = !body.hidden; byId("opt-settings-toggle").innerText = body.hidden ? "+" : "-"; saveGlobalSettings(); };
["opt-auto-values", "opt-auto-buy-buttons", "opt-sync-order-quantities", "opt-limit-order-quantity-to-queue", "opt-verify-buy-position", "opt-alarm-enabled", "opt-alarm-count", "opt-alarm-interval"].forEach(id => byId(id).addEventListener("change", () => {
    saveGlobalSettings();
    if (id === "opt-alarm-enabled") syncOptionAlarmControlsVisibility();
    if (id === "opt-sync-order-quantities") syncAllPairQuantities();
    if (id === "opt-auto-buy-buttons") {
        pairStates.forEach(pair => withPair(pair, async () => syncInitialPositionButtonVisibility()));
    }
}));
byId("opt-settings-reset").onclick = () => { localStorage.removeItem(GLOBAL_STORAGE_KEY); location.reload(); };
loadPairs(); loadGlobalSettings(); renderAllPairs(); refreshAllPairs().catch(showOptionError);
setInterval(() => refreshAllPairs().catch(showOptionError), 2000);
setInterval(() => pairStates.forEach(pair => updatePair(pair).catch(() => {})), 1000);
/*---------------------------------------------------------------------*/
