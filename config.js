(function () {

    const profiles = {
        "patris.parsianbroker.com": {
            name: "Parsian",
            type: "parsian",
            apiBaseUrl: "https://red.parsianbroker.com",
            authStorageKey: "auth",
            endpoints: {
                searchInstruments: "/api/PublicMessages/SearchInstruments",
                orderEntry: "/api/Orders/OrderEntry",
                optionStrategies: "/api/OptionStrategies/Get",
                optionStrategyCreate: "/api/OptionStrategies/Create"
            }
        },
        "khobregan.tsetab.ir": {
            name: "Khobregan",
            type: "khobregan",
            apiBaseUrl: "https://khobregan-red.tsetab.ir",
            authStorageKey: "auth",
            endpoints: {
                searchInstruments: "/api/PublicMessages/SearchInstruments",
                orderEntry: "/api/Orders/OrderEntry",
                optionStrategies: "/api/OptionStrategies/Get",
                optionStrategyCreate: "/api/OptionStrategies/Create"
            }
        },
        "khobregan-red.tsetab.ir": {
            name: "Khobregan",
            type: "khobregan",
            apiBaseUrl: "https://khobregan-red.tsetab.ir",
            authStorageKey: "auth",
            endpoints: {
                searchInstruments: "/api/PublicMessages/SearchInstruments",
                orderEntry: "/api/Orders/OrderEntry",
                optionStrategies: "/api/OptionStrategies/Get",
                optionStrategyCreate: "/api/OptionStrategies/Create"
            }
        },
        "gs.ephoenix.ir": {
            name: "Ganjineh Sepahr",
            type: "ephoenix",
            apiBaseUrl: "https://api-gs.ephoenix.ir/api/v2/",
            optionApiBaseUrl: "https://gs-mdp.ephoenix.ir/option/api/v1/",
            marketApiBaseUrl: "https://marketdatagw.ephoenix.ir/api/v2/",
            sessionStorageKey: "x-sessionId",
            loginDataStorageKey: "LoginData",
            endpoints: {
                orderEntry: "/api/v2/orders/NewOrder",
                openOrders: "/api/v2/orders/GetOpenOrders?type=1",
                chainContractUserDefault: "/api/v2/users/GetChainContractUserDefault",
                optionUnderlyingAssets: "/option/api/v1/Option/AllUnderlyingAssets",
                optionExerciseDates: "/option/api/v1/Option/AllAvailableExerciseDates",
                optionChain: "/option/api/v1/Option/Chain"
            }
        }
    };

    const activeProfile = profiles[location.hostname];

    if (!activeProfile) {
        throw new Error(
            `Parsian Pro Trader: no broker configuration for ${location.hostname}`
        );
    }

    window.PPT_BROKER_CONFIG = Object.freeze(activeProfile);

})();
