(function () {

    console.log("Pro Trader loader");

    const assetUrl = path =>
        chrome.runtime.getURL(path) +
        "?v=" + encodeURIComponent(chrome.runtime.getManifest().version);

    async function loadUI() {

        if (document.getElementById("ppt-extension-root")) return;

        const [html, css] = await Promise.all([
            fetch(assetUrl("ui.html")).then(r => r.text()),
            fetch(assetUrl("ui.css")).then(r => r.text())
        ]);

        const host = document.createElement("div");
        host.id = "ppt-extension-root";

        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = `<style>${css}</style>${html}`;

        document.body.appendChild(host);

        const configScript = document.createElement("script");
        configScript.src = assetUrl("config.js");

        configScript.onload = () => {
            const adapterScript = document.createElement("script");
            adapterScript.src = assetUrl("broker-adapters.js");

            const loadMainScript = () => {
                const uiScript = document.createElement("script");
                uiScript.src = assetUrl("ui.js");
                document.body.appendChild(uiScript);
                adapterScript.remove();
            };

            adapterScript.onload = loadMainScript;
            adapterScript.onerror = loadMainScript;

            document.body.appendChild(adapterScript);
            configScript.remove();
        };

        document.body.appendChild(configScript);
    }

    function wait() {
        const i = setInterval(() => {
            if (document.body) {
                clearInterval(i);
                loadUI();
            }
        }, 300);
    }

    wait();

})();
