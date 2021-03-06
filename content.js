let startUp = +new Date();
let blockedCookieBanner = false;
let lastModification = null;
let checkAfterModification = null;

// TODO: create config page
let configs = {
    removeRadicalAllPopus: true,
    cookieHtmlKeywords: [ "cookie" ],
    cookieBodyClassKeywords: [ "cookie", "consent" ],
    verbose: true
};


// All tags that are not used for a popup are filtered out via the
// CSS selector :not().
// This will also find CUSTOM tags like on youtube.com (<paper-dialog>)

const HTML_TAGS = [ "a", "abbr", "acronym", "address", "applet", "area", "article", "aside", "audio", "b", "base", "basefont", "bdi", "bdo", "big", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "font", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map", "mark", "meta", "meter", "nav", "noframes", "noscript", "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small", "source", "span", "strike", "strong", "style", "sub", "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "tt", "u", "ul", "var", "video", "wbr", ]


const POPUP_TAGS = ['div', 'section', 'footer', 'aside', 'form', 'iframe', 'dialog']
const IGNORE_TAGS_SELECTOR = HTML_TAGS.filter(tag => !POPUP_TAGS.find(e => e === tag)).map(tag => `:not(${tag})`).join("")
const POPUP_TAGS_SELECTOR = "*" + IGNORE_TAGS_SELECTOR;


function log (type, ...msg) {
    if (configs.verbose)
    console[type](...msg);
}

const logger = {
    info: (...msg) => log("info", ...msg),
    error: (...msg) => log("error", ...msg)
}


// -- Popups --
// Searches for popups like newsletter signups, cookie banners
// or similar, which are displayed as popups within the pages. 
// The logic: it searches for overlays that overlay the whole page.
// The overlay and everything that has a higher zIndex will be removed.

function findAndRemovePopups(checkElements = null) {

    let fixedElements = (checkElements) ? checkElements : findElementByCssRule('position', "fixed");

    let zIndex = -1;
    let removed = 0;
    let removeFixedElements = [];
    
    for (fixedElement of fixedElements) {
        
        const rect = fixedElement.getBoundingClientRect()
        
        if ( rect.top === 0 && hasSameSizeAsWindow(rect) ) {
            let tempZIndex = window.getComputedStyle(fixedElement).zIndex;
            if (tempZIndex > zIndex) {
                zIndex = tempZIndex;
            }
            removeFixedElements.push(fixedElement);
        }
        
    }

    if (removeFixedElements.length > 0) {
        logger.info("[inline-popup-blocker] FOUND Element (OVERLAY): ", removeFixedElements);
        removeFixedElements.forEach(hideElementWithCSS);
        removed = removeFixedElements.length;
    }

    if (zIndex > -1 && zIndex > 100) {

        let popupElements = findElementByCssRule('zIndex', parseInt(zIndex), (a, b) => a > b);

        logger.info("[inline-popup-blocker] FOUND Element (> OVERLAY): ", popupElements);

        popupElements.forEach(hideElementWithCSS);

        removed += popupElements.length;

    }

    return removed;

}



// -- Cookies banners --
// The logic: fixed or absolute element, elements with
// high z-index, which have inside specific keywords.
function removeCookieBanner () {

    let blocked = false;

    let fixedElements = findElementByCssRule('position', null, e => e === "fixed" || e === "absolute");

    fixedElements = fixedElements.concat(findElementByCssRule('zIndex', 100, (a, b) => a > b));

    fixedElements.forEach(fixedElement => {

        let childrenWithFixed = findElementByCssRule("position", "fixed", (a, b) => a === b, fixedElement)
        if (childrenWithFixed.length > 0) return;

        configs.cookieHtmlKeywords.forEach(cookieHtmlKeyword => {
            
            try {
                if (fixedElement.innerHTML.toLowerCase().indexOf(cookieHtmlKeyword) > 1) {
                    if ( window.getComputedStyle(fixedElement).display !== "none") {

                        logger.info("[inline-popup-blocker] FOUND Element by keyword = " + cookieHtmlKeyword + ": ", fixedElement);   
                        hideElementWithCSS(fixedElement);
                        blocked = true;

                    }
                }
            } catch (error) {}

        })
        
    });

    return blocked;


}


// -- Unblock scroll --

function removeScrollBlocker () {

    const html = document.getElementsByTagName("html")[0];

    if ( document.body.style.overflow !== "unset" || html.style.overflow !== "auto" ) {

        [ html, document.body ].forEach(element => {

            if (element === document.body) {
                element.style.setProperty("overflow", "unset", "important");
            } else {
                element.style.setProperty("overflow", "auto", "important");
            }

            // some pages do not work if the position of the body is not absolute (see https://www.uni-goettingen.de/)
            if (window.getComputedStyle(element).position !== "absolute") {
                element.style.setProperty("position", "unset", "important");
            }
        })

        addStyleRules(`
html { overflow: auto !important; }    
body { overflow: auto !important; }    
`, false);

    }

}


// -- Main function --
let currentWaitTimer = 200;

function startPopUpCleaner (checkElements = null) {
    
    if (!configs.removeRadicalAllPopus && startUp <= +new Date() - 1000 * 30) {
        // After 30 seconds at the latest, all cookie banners should have appeared.
        return;
    }

    if (!blockedCookieBanner) {
        blockedCookieBanner = removeCookieBanner()
    }

    // So that the performance when using pages does not suffer as for
    // example on youtube.com, where elements are quite often mitigated.
    let seconds = (+new Date() - startUp) / 1000;

    if (seconds > 5)  currentWaitTimer = 500;
    if (seconds > 10) currentWaitTimer = 1000;
    if (seconds > 20) currentWaitTimer = 2000;

    if (lastModification >= +new Date() - currentWaitTimer) {
        // The next function is very computationally intensive (for loops), so it should not
        // be called immediately after each change, but several changes should
        // first be collected and then checked again.
        return;
    }

    findAndRemovePopups(checkElements);

}


function createObserver() {

    // callback function to execute when mutations are observed
    let checkElements = []
    const observer = new MutationObserver(mutationRecords => {
   
        let elements = mutationRecords.map(e => e.target);
        for (element of elements) {
            elements = elements.concat([...element.querySelectorAll(POPUP_TAGS_SELECTOR)]);
        }

        if (elements.length > 2000) {
            // at heise.de the cookie banner appears at ~1400 changes
            // prevent performance problems (youtube.com often has up to 20000 changes)
            return;
        }

        for (element of elements) {
            if (window.getComputedStyle(element, null)["position"] === "fixed") {
                checkElements.push(element);
            }
        }

        if (checkElements.length > 0) {

            lastModification = +new Date();
            if (checkAfterModification) clearTimeout(checkAfterModification);

            checkAfterModification = setTimeout(() => {

                startPopUpCleaner(checkElements);
                checkElements = [];

            }, currentWaitTimer);

        }

    })

    observer.observe(document.body, { attributes: false, childList: true, subtree: true })

}

try {

    // run initially (after dom content loaded)
    
    const hostname = window.location.hostname;
    
    browser.storage.sync.get(hostname).then(async (res) => {
        
        if (res[hostname] == 'i') return;
        
        if(await getCSSCache()) {
            removeScrollBlocker();
            removeClassNamesByKeywords();
        }

        startPopUpCleaner();
        createObserver();

        setTimeout(() => {
            startPopUpCleaner();
            removeClassNamesByKeywords();
        }, 100);

    }).catch(logger.error);
    

} catch (error) {
    logger.error("[inline-popup-blocker] ERROR:", error);
}


//  ---------- Cache Functions ----------
// Cache found popups so that they can be removed
// faster at the next startup.
// Also, with large sites (youtube.com) there is
// still performance problem when detecting popups

const cacheName = location.host + "-cache";

let elementsToRemove = [];
let cssRulesCache = "";

async function getCSSCache (addRules = true) {
    
    const cachedForHostname = await browser.storage.sync.get(cacheName);
    let cache = cachedForHostname[cacheName];
    
    if (
        cache === undefined ||
        cache.cssRulesCache === undefined ||
        cache.cssRulesCache === "" 
    ) {
        return null;
    }
        
    if (addRules) {
        logger.info("[inline-popup-blocker] restoredFromCache");
        addStyleRules(cache.cssRulesCache, false);
    }

    return cache.cssRulesCache;

}

function cacheCssRules () {

    const hostname = window.location.hostname;

    browser.storage.sync.get(hostname).then(async (cachedForHostname) => {

        browser.storage.sync.set({ [cacheName]:  {
            ...cachedForHostname[cacheName],
            cssRulesCache: (await getCSSCache() || "") + " " +  cssRulesCache
        }});

    })

}


//  ---------- Some Helper Functions ----------

function removeClassNamesByKeywords () {

    // Some sites have special rules when the cookie banner is displayed (see https://www.computerbase.de)
    const newClassName = []
    document.body.classList.forEach(className => {

        for (const keyword of configs.cookieBodyClassKeywords) {
            if (className.indexOf(keyword) !== -1) 
                return;
        }
        newClassName.push(className);
    })

    document.body.className = newClassName.join(" ");
    
}

function getSelectorByIdentifier (elementToRemove) {

    let selector = `${elementToRemove.tagName}`;
    
    if (elementToRemove.id !== "")
        selector += "#" + elementToRemove.id;
    
    if (elementToRemove.className !== "")
        // filtering is important if there are too many spaces in the className for some reason
        selector += "." + elementToRemove.className.split(" ").filter(e => e !== "").join(".");

    return selector;
    
}

function getIdentifierForElement (element) {

    return {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        date: +new Date()
    }

}

function findElementByCssRule (name, value, check = (a, b) => a === b, element = document.body) {

    let elements = [...element.querySelectorAll(POPUP_TAGS_SELECTOR)];
    
    let shadowElements = elements.filter(e => e.shadowRoot).map(e => {
        // get all html elements from the shadow element and filter elements like the style tag 
        return [...e.shadowRoot.childNodes].filter(e => e.querySelectorAll).map(e => [...e.querySelectorAll(POPUP_TAGS_SELECTOR)]).flat();
    }).flat();

    elements = elements.concat(shadowElements);

    let foundElements = []

    for (element of elements) {

        if (check(window.getComputedStyle(element, null)[name], value)) {
            foundElements.push(element)
        }

    }
    return foundElements;

}

function hasSameSizeAsWindow (rect, radius = 100) {
    return (
        rect.width > window.innerWidth - radius && rect.width < window.innerWidth + radius && 
        rect.height > window.innerHeight - radius
    )
}


function isFixed(node) {
    return window.getComputedStyle(node).position === 'fixed'
}

function hideElementWithCSS (element, timeout = false) {

    if (element.getRootNode().host) {
        element = element.getRootNode().host;
    }

    let selector = getSelectorByIdentifier(getIdentifierForElement(element));
    addStyleRules(`${selector} { display: none !important; }`);

    if (timeout)
        return;

    setTimeout(() => {
        // sometimes the identifier changes and the cookie banner comes back
        hideElementWithCSS(element, true)
    }, 500);

}

let rulesCache = []

function addStyleRules (rules, addToCache = true) {

    if (rulesCache.find(e => e === rules)) {
        return;
    }

    rulesCache.push(rules);

    if (addToCache) {
        cssRulesCache += rules;
        cacheCssRules();
        removeScrollBlocker();
        browser.runtime.sendMessage('blocked');
    }

    logger.info("[inline-popup-blocker] ADD customCSSRules ", rules.split("\n").join(" "));

    try {
        let style = document.createElement("style")
        style.innerHTML = rules;
        document.head.append(style);
    } catch (error) {
        console.log(error);
    }

}
