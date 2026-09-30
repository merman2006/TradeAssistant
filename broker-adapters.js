(function () {

    function createUrl(baseUrl, endpoint) {
        return new URL(endpoint, baseUrl).toString();
    }

    function parseJsonStorage(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (_) {
            return null;
        }
    }

    function normalizeStorageValue(value) {
        if (!value)
            return "";

        try {
            const parsed = JSON.parse(value);
            return String(parsed || "");
        } catch (_) {
            return String(value || "").replace(/^"+|"+$/g, "");
        }
    }

    function getFirstValue(source, keys) {
        for (const key of keys) {
            if (source?.[key] !== undefined && source?.[key] !== null)
                return source[key];
        }

        return undefined;
    }

    function normalizeStrategy(strategy) {
        const key = getFirstValue(strategy, [
            "key",
            "uniqueKey",
            "UniqueKey",
            "optionStrategyUniqueKey",
            "OptionStrategyUniqueKey"
        ]);
        const label = getFirstValue(strategy, [
            "label",
            "title",
            "Title",
            "name",
            "Name"
        ]);

        return {
            ...strategy,
            label,
            key,
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
        };
    }

    function getArrayData(value) {
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
    }

    function normalizeNumber(value) {
        const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
        const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

        const normalized = String(value || "")
            .replace(/[۰-۹]/g, digit => persianDigits.indexOf(digit))
            .replace(/[٠-٩]/g, digit => arabicDigits.indexOf(digit))
            .replace(/,/g, "")
            .replace(/[^\d.-]/g, "")
            .trim();

        const number = Number(normalized);

        return Number.isFinite(number)
            ? number
            : null;
    }

    function getOptionStrikePriceFromDescription(description) {
        // Example: "اختیارخ خساپا-600-1405/08/27" → 600.
        // The strike is accepted only when it is immediately followed by a
        // Jalali expiry date, so an option ticker such as "ضسپا8086" is never
        // mistaken for a strike price.
        const match = String(description || "").match(
            /(?:^|[\s-])([0-9۰-۹٠-٩][0-9۰-۹٠-٩,،]*)\s*-\s*(?:13|14)[0-9۰-۹٠-٩]{2}\s*\/\s*[0-9۰-۹٠-٩]{1,2}\s*\/\s*[0-9۰-۹٠-٩]{1,2}\b/
        );

        return match
            ? normalizeNumber(match[1].replace(/،/g, ","))
            : null;
    }

    function escapeSelectorValue(value) {
        if (window.CSS?.escape)
            return CSS.escape(value);

        return String(value || "")
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"');
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

    function collectResponseMessages(value, messages = [], seen = new Set()) {
        if (value === null || value === undefined)
            return messages;

        if (typeof value === "string") {
            const message = value.trim();

            if (message)
                messages.push(message);

            return messages;
        }

        if (typeof value !== "object")
            return messages;

        if (seen.has(value))
            return messages;

        seen.add(value);

        [
            "message",
            "Message",
            "errorMessage",
            "ErrorMessage",
            "error",
            "Error",
            "detail",
            "Detail",
            "details",
            "Details",
            "title",
            "Title",
            "description",
            "Description"
        ].forEach(key => {
            if (typeof value[key] === "string") {
                const message = value[key].trim();

                if (message)
                    messages.push(message);
            }
        });

        [
            value.errors,
            value.response?.errors,
            value.response?.message,
            value.response?.Message,
            value.response?.errorMessage,
            value.response?.ErrorMessage,
            value.result?.errors,
            value.result?.message,
            value.result?.Message,
            value.result?.errorMessage,
            value.result?.ErrorMessage
        ].forEach(item => collectResponseMessages(item, messages, seen));

        if (Array.isArray(value)) {
            value.forEach(item =>
                collectResponseMessages(item, messages, seen)
            );
        }

        return messages;
    }

    function getApiErrorMessage(result, fallbackMessage) {
        const messages = Array
            .from(new Set(collectResponseMessages(result)))
            .filter(Boolean);

        return messages.join("، ") || fallbackMessage;
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

    async function readJsonResponse(response) {
        const text = await response.text();

        if (!text.trim())
            return null;

        try {
            return JSON.parse(text);
        } catch (_) {
            return {
                message: text.trim()
            };
        }
    }

    function createParsianLikeAdapter(config) {
        const apiUrl = endpoint => createUrl(config.apiBaseUrl, endpoint);
        const getAuth = () => {
            const value = localStorage.getItem(config.authStorageKey);
            const parsed = parseJsonStorage(config.authStorageKey);

            if (parsed !== null && parsed !== undefined)
                return parsed;

            return normalizeStorageValue(value);
        };

        async function fetchJson(endpoint, options = {}) {
            const response = await fetch(apiUrl(endpoint), options);
            const json = await readJsonResponse(response);

            if (!response.ok) {
                throw new Error(getApiErrorMessage(
                    json,
                    `خطای ${response.status} در ${endpoint}`
                ));
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
                const payload = {
                    PrincipalId: null,
                    InstrumentId: instrument.instrumentId,
                    ISensOM: side,
                    YValiOmNSC: "Day",
                    PLimSaiOM: price,
                    QTitTotOM: quantity,
                    QTitDvlOM: 0,
                    extraInfo: JSON.stringify({ ark: crypto.randomUUID() }),
                    ExecutionType: "Instant"
                };

                const { json } = await fetchJson(
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
                const prefix = "option-instrument-focus-target-";

                return Array
                    .from(document.querySelectorAll(
                        `#sc-optionInstrumentFavoriteList > li[id^="${prefix}"]`
                    ))
                    .map(item => {
                        const instrumentId = item.id.slice(prefix.length);
                        const header = item.querySelector(
                            "client-option-instruments-favorites-item-header main"
                        );
                        const symbol =
                            header?.querySelector("label")?.innerText.trim();
                        const description =
                            Array.from(header?.children || [])
                                .find(element => element.tagName === "SPAN")
                                ?.innerText.trim();
                        const strikePrice =
                            getOptionStrikePriceFromDescription(description);

                        return {
                            instrumentId,
                            isin: instrumentId,
                            // Keep the combobox label compact; description is
                            // metadata used only for the automatic strike read.
                            title: symbol || description,
                            description,
                            strikePrice
                        };
                    })
                    .filter(item => item.instrumentId && item.title);
            },

            getOptionAutoValues(instrumentIdA, instrumentIdB) {
                const symbols = this.getOptionSymbols();
                const symbolA = symbols.find(symbol =>
                    symbol.instrumentId === instrumentIdA
                );
                const symbolB = symbols.find(symbol =>
                    symbol.instrumentId === instrumentIdB
                );

                return {
                    maxValue:
                        Number.isFinite(symbolA?.strikePrice) &&
                        Number.isFinite(symbolB?.strikePrice)
                            ? Math.abs(symbolB.strikePrice - symbolA.strikePrice)
                            : null,
                    premium: null
                };
            },

            getSelectedOptionContainer(instrumentId) {
                if (!instrumentId)
                    return null;

                return document.getElementById(
                    "option-instrument-focus-target-" + instrumentId
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
                    bid: normalizeNumber(bid?.innerText),
                    ask: normalizeNumber(ask?.innerText)
                };
            },

            getOptionPositionValue(instrumentId, columnId) {
                if (!instrumentId)
                    return null;

                const row = document.querySelector(
                    `.ag-center-cols-container [role="row"][row-id="${escapeSelectorValue(instrumentId)}"]`
                );
                const cell = row?.querySelector(
                    `[col-id="${columnId}"]`
                );

                return normalizeNumber(cell?.innerText);
            },

            async isOptionBuyOrderExecuted() {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }
        };
    }

    function createEphoenixAdapter(config) {
        let chainCache = [];
        let chainCacheKey = "";
        let chainCacheExpiresAt = 0;
        let selectedBaseIsin = "";
        let selectedExerciseDate = "";

        const apiUrl = endpoint => createUrl(config.apiBaseUrl, endpoint);
        const optionUrl = endpoint => createUrl(config.optionApiBaseUrl, endpoint);

        function getSessionId() {
            const directSession = normalizeStorageValue(
                localStorage.getItem(config.sessionStorageKey)
            );

            if (directSession)
                return directSession;

            const loginData = parseJsonStorage(config.loginDataStorageKey);

            return loginData?.sessionId || "";
        }

        function getHeaders() {
            const sessionId = getSessionId();

            if (!sessionId) {
                throw new Error("شناسه نشست کارگزاری گنجینه سپهر پیدا نشد؛ دوباره وارد سایت شوید.");
            }

            return {
                "content-type": "application/json",
                "accept": "application/json, text/plain, */*",
                "x-sessionId": sessionId
            };
        }

        async function fetchJson(url, options = {}) {
            const response = await fetch(url, {
                credentials: "include",
                ...options,
                headers: {
                    ...getHeaders(),
                    ...(options.headers || {})
                }
            });
            const json = await readJsonResponse(response);

            if (!response.ok) {
                throw new Error(getApiErrorMessage(
                    json,
                    `خطای ${response.status}`
                ));
            }

            return {
                response,
                json
            };
        }

        function flattenChain(chain) {
            return (Array.isArray(chain) ? chain : [])
                .flatMap(row => [
                    row.callOption && {
                        ...row.callOption,
                        optionType: "call",
                        strikePrice: row.strikePrice
                    },
                    row.putOption && {
                        ...row.putOption,
                        optionType: "put",
                        strikePrice: row.strikePrice
                    }
                ])
                .filter(Boolean)
                .map(option => ({
                    instrumentId: option.isin,
                    isin: option.isin,
                    title: [
                        option.symbol,
                        option.optionType === "call" ? "اختیار خرید" : "اختیار فروش",
                        Number(option.strikePrice || 0).toLocaleString("en-US")
                    ].filter(Boolean).join(" - "),
                    symbol: option.symbol,
                    strikePrice: option.strikePrice,
                    breakEvenPoint: option.breakEvenPoint,
                    bid: option.bestBuyPrice,
                    ask: option.bestSellPrice,
                    bidVolume: option.bestBuyVolume,
                    askVolume: option.bestSellVolume
                }));
        }

        async function resolveDefaultChainContext() {
            if (selectedBaseIsin && selectedExerciseDate)
                return;

            if (!selectedBaseIsin) {
                const defaults = await fetchJson(
                    apiUrl(config.endpoints.chainContractUserDefault)
                ).then(result => getResponseData(result.json))
                    .catch(() => []);

                selectedBaseIsin =
                    Array.isArray(defaults) && defaults[0]?.isin
                        ? defaults[0].isin
                        : "";
            }

            if (!selectedBaseIsin) {
                const assets = await fetchJson(
                    optionUrl(config.endpoints.optionUnderlyingAssets)
                ).then(result => getResponseData(result.json));

                selectedBaseIsin = Array.isArray(assets) && assets[0]?.isin
                    ? assets[0].isin
                    : "";
            }

            if (!selectedBaseIsin) {
                throw new Error("نماد پایه اختیار در گنجینه سپهر پیدا نشد.");
            }

            const dates = await fetchJson(
                optionUrl(
                    config.endpoints.optionExerciseDates +
                    "?BaseAssetIsin=" + encodeURIComponent(selectedBaseIsin)
                )
            ).then(result => getResponseData(result.json));

            selectedExerciseDate = Array.isArray(dates) &&
                dates[0]?.exerciseDate
                ? dates[0].exerciseDate
                : "";

            if (!selectedExerciseDate) {
                throw new Error("تاریخ اعمال اختیار در گنجینه سپهر پیدا نشد.");
            }
        }

        async function refreshOptionMarketData(force = false) {
            await resolveDefaultChainContext();

            const key = `${selectedBaseIsin}|${selectedExerciseDate}`;
            const now = Date.now();

            if (!force && key === chainCacheKey && now < chainCacheExpiresAt)
                return chainCache;

            const { json } = await fetchJson(
                optionUrl(
                    config.endpoints.optionChain +
                    "?BaseAssetIsin=" + encodeURIComponent(selectedBaseIsin) +
                    "&ExerciseDate=" + encodeURIComponent(selectedExerciseDate)
                )
            );

            chainCache = flattenChain(getResponseData(json));
            chainCacheKey = key;
            chainCacheExpiresAt = now + 1500;

            return chainCache;
        }

        function getWatchlistRowSelector(isin = "") {
            const escapedIsin = escapeSelectorValue(isin);

            return isin
                ? `app-premium-option-watchlist-table [role="row"][row-id="${escapedIsin}"]`
                : 'app-premium-option-watchlist-table [role="row"][row-id^="IRO"]';
        }

        function getWatchlistCellText(row, columnId) {
            const cell = row?.querySelector?.(
                `[role="gridcell"][col-id="${columnId}"]`
            );

            return normalizeDomText(cell?.innerText || cell?.textContent);
        }

        function getWatchlistSymbolText(row) {
            const symbolCell = row?.querySelector?.(
                '[role="gridcell"][col-id="symbol"]'
            );
            const symbolText = symbolCell?.querySelector?.(".text-navy");

            return normalizeDomText(
                symbolText?.innerText ||
                symbolText?.textContent ||
                symbolCell?.innerText ||
                symbolCell?.textContent
            )
                .replace(/حذف از دیده بان|خرید|فروش/g, "")
                .trim();
        }

        function readWatchlistQuoteFromDom(isin) {
            const quote = {
                bid: null,
                ask: null,
                bidVolume: null,
                askVolume: null
            };
            const readCellNumber = columnId => {
                const cells = document.querySelectorAll(
                    `${getWatchlistRowSelector(isin)} [col-id="${columnId}"]`
                );

                for (const cell of cells) {
                    const value = normalizeNumber(
                        cell.innerText || cell.textContent
                    );

                    if (value !== null)
                        return value;
                }

                return null;
            };

            quote.bid = readCellNumber("buyPrice");
            quote.ask = readCellNumber("sellPrice");
            quote.bidVolume = readCellNumber("buyVolume");
            quote.askVolume = readCellNumber("sellVolume");

            return quote;
        }

        function readWatchlistSymbolsFromDom() {
            const symbols = new Map();

            Array
                .from(document.querySelectorAll(getWatchlistRowSelector()))
                .filter(isElementVisible)
                .forEach(row => {
                    const isin = row.getAttribute("row-id");

                    if (!isin)
                        return;

                    const current = symbols.get(isin) || {
                        instrumentId: isin,
                        isin,
                        title: "",
                        symbol: "",
                        bid: null,
                        ask: null,
                        bidVolume: null,
                        askVolume: null
                    };
                    const symbol = getWatchlistSymbolText(row);
                    const quote = readWatchlistQuoteFromDom(isin);

                    if (symbol) {
                        current.symbol = symbol;
                        current.title = symbol;
                    }

                    if (quote.bid !== null)
                        current.bid = quote.bid;

                    if (quote.ask !== null)
                        current.ask = quote.ask;

                    if (quote.bidVolume !== null)
                        current.bidVolume = quote.bidVolume;

                    if (quote.askVolume !== null)
                        current.askVolume = quote.askVolume;

                    symbols.set(isin, current);
                });

            chainCache = Array
                .from(symbols.values())
                .filter(symbol => symbol.instrumentId && symbol.title);

            chainCacheKey = "watchlist-dom";
            chainCacheExpiresAt = Date.now() + 1500;

            return chainCache;
        }

        function normalizeDomText(value) {
            return String(value || "")
                .replace(/&zwnj;/g, "\u200c")
                .replace(/\u200c/g, "")
                .replace(/\s+/g, " ")
                .trim();
        }

        function isElementVisible(element) {
            if (!element)
                return false;

            const style = window.getComputedStyle(element);

            if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                Number(style.opacity) === 0
            ) {
                return false;
            }

            const rect = element.getBoundingClientRect();

            return rect.width > 0 && rect.height > 0;
        }

        function isWatchlistTabActive() {
            return Array
                .from(document.querySelectorAll(".bg-primary"))
                .some(element =>
                    isElementVisible(element) &&
                    normalizeDomText(element.innerText || element.textContent)
                        .includes("دیدبان")
                );
        }

        return {
            name: config.name,
            type: config.type,
            supportsOptionStrategies: false,

            isOptionPageVisible() {
                return window.location.pathname
                    .startsWith("/dashboard/premium/option");
            },

            async searchInstruments(query) {
                await refreshOptionMarketData();
                const normalizedQuery = String(query || "").trim();

                return chainCache
                    .filter(item =>
                        !normalizedQuery ||
                        item.title.includes(normalizedQuery) ||
                        item.symbol?.includes(normalizedQuery) ||
                        item.isin?.includes(normalizedQuery)
                    );
            },

            async placeStockOrder({ instrument, side, price, quantity }) {
                return this.placeOptionOrder({
                    instrumentId: instrument.isin || instrument.instrumentId,
                    side,
                    price,
                    quantity
                }).then(result => result.json);
            },

            async fetchOptionStrategies() {
                return [];
            },

            async refreshOptionMarketData() {
                if (!isWatchlistTabActive())
                    return chainCache;

                return readWatchlistSymbolsFromDom();
            },

            async getOptionSymbols() {
                if (!isWatchlistTabActive())
                    return [];

                return readWatchlistSymbolsFromDom();
            },

            getOptionSymbolsEmptyMessage() {
                return isWatchlistTabActive()
                    ? "نمادی در دیدبان‌های گنجینه سپهر پیدا نشد."
                    : "برای دریافت نمادها در گنجینه سپهر، وارد تب دیدبان‌ها شوید.";
            },

            getOptionQuote(instrumentId) {
                readWatchlistSymbolsFromDom();
                const liveQuote = readWatchlistQuoteFromDom(instrumentId);

                const item = chainCache.find(symbol =>
                    symbol.instrumentId === instrumentId ||
                    symbol.isin === instrumentId
                );

                return {
                    bid: liveQuote.bid ?? item?.bid ?? null,
                    ask: liveQuote.ask ?? item?.ask ?? null
                };
            },

            getOptionAutoValues(instrumentIdA, instrumentIdB) {
                const symbolA = chainCache.find(symbol =>
                    symbol.instrumentId === instrumentIdA
                );
                const symbolB = chainCache.find(symbol =>
                    symbol.instrumentId === instrumentIdB
                );

                return {
                    premium:
                        Number.isFinite(symbolA?.breakEvenPoint) &&
                        Number.isFinite(symbolB?.breakEvenPoint)
                            ? Math.abs(symbolA.breakEvenPoint - symbolB.breakEvenPoint)
                            : null,
                    maxValue:
                        Number.isFinite(symbolA?.strikePrice) &&
                        Number.isFinite(symbolB?.strikePrice)
                            ? Math.abs(symbolB.strikePrice - symbolA.strikePrice)
                            : null
                };
            },

            async placeOptionOrder({ instrumentId, side, price, quantity }) {
                const { response, json } = await fetchJson(
                    apiUrl(config.endpoints.orderEntry),
                    {
                        method: "POST",
                        body: JSON.stringify({
                            validity: 1,
                            validityDate: null,
                            price,
                            volume: quantity,
                            side: side === "Buy" ? 1 : 2,
                            isin: instrumentId,
                            accountType: 1
                        })
                    }
                );

                const isFailed =
                    json?.isSuccess === false ||
                    json?.success === false ||
                    json?.errorCode > 0;

                if (isFailed) {
                    throw new Error(getApiErrorMessage(
                        json,
                        "خطا در ثبت سفارش"
                    ));
                }

                return {
                    response,
                    json
                };
            },

            async isOptionBuyOrderExecuted() {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }
        };
    }

    window.PPT_BROKER_ADAPTERS = Object.freeze({
        create(config) {
            if (config.type === "ephoenix")
                return createEphoenixAdapter(config);

            return createParsianLikeAdapter(config);
        }
    });

})();
