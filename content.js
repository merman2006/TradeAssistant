(function () {

    console.log("Pro Trader loader");

    async function loadUI() {

        if (document.getElementById("ppt-extension-root")) return;

        const [html, css] = await Promise.all([
            fetch(chrome.runtime.getURL("ui.html")).then(r => r.text()),
            fetch(chrome.runtime.getURL("ui.css")).then(r => r.text())
        ]);

        const host = document.createElement("div");
        host.id = "ppt-extension-root";

        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = `<style>${css}</style>${html}`;

        document.body.appendChild(host);

        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("ui.js");
        document.body.appendChild(script);
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
