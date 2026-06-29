(function () {

    const profiles = {
        "patris.parsianbroker.com": {
            name: "Parsian",
            apiBaseUrl: "https://red.parsianbroker.com",
            authStorageKey: "auth",
            endpoints: {
                searchInstruments: "/api/PublicMessages/SearchInstruments",
                orderEntry: "/api/Orders/OrderEntry",
                optionStrategies: "/api/OptionStrategies/Get"
            }
        },
        "khobregan.tsetab.ir": {
            name: "Khobregan",
            apiBaseUrl: "https://khobregan-red.tsetab.ir",
            authStorageKey: "auth",
            endpoints: {
                searchInstruments: "/api/PublicMessages/SearchInstruments",
                orderEntry: "/api/Orders/OrderEntry",
                optionStrategies: "/api/OptionStrategies/Get"
            }
        },
        "khobregan-red.tsetab.ir": {
            name: "Khobregan",
            apiBaseUrl: "https://khobregan-red.tsetab.ir",
            authStorageKey: "auth",
            endpoints: {
                searchInstruments: "/api/PublicMessages/SearchInstruments",
                orderEntry: "/api/Orders/OrderEntry",
                optionStrategies: "/api/OptionStrategies/Get"
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
