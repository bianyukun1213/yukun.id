let source;
const url = new URL(window.location.href);
const spLang = url.searchParams.get('lang');
source = url.searchParams.get('s') ?? '';
let newUrl = url.origin + url.pathname;
url.searchParams.delete('lang');
let qs = url.searchParams.toString();
if (qs) newUrl += '?' + qs;
window.history.replaceState(null, null, newUrl);

function setGetMoreContact(langKey) {
    const sitekey = 'fefa711e-7296-4e5a-b988-d6766f087b8a';
    const getMoreContact = document.getElementById('get-more-contact');
    const captchaContainer = document.getElementById('captcha-container');
    const captchaStatus = document.getElementById('captcha-status');
    const moreContactContainer = document.getElementById('more-contact-container');
    const fetchMoreContact = function (token) {
        fetch('https://service.yukun.bio/get-more-contact', {
            method: 'POST',
            body: JSON.stringify({ hCaptchaToken: token, source: typeof source !== 'undefined' ? source : undefined })
        }).then(async function (response) {
            const res = await response.json();
            if (!response.ok && !res) {
                console.error(`Unable to get more contact: Server returned status ${response.status}.`);
                moreContactContainer.innerHTML = `<p>${content[langKey].moreContactLoadingFailed}</p><p>${response.status}</p>`;
                return;
            }
            if (res.code !== 0) {
                console.error(`Unable to get more contact: Server returned data ${JSON.stringify(res)}.`);
                moreContactContainer.innerHTML = `<p>${content[langKey].moreContactLoadingFailed}</p><p>${res.msg}</p>`;
                return;
            }
            moreContactContainer.innerHTML = marked.parse(res.data[langKey]);
        }).catch(function (e) {
            console.error('Unable to get more contact:', e);
            moreContactContainer.innerHTML = `<p>${content[langKey].moreContactLoadingFailed}</p><p>${e}</p>`;
        });
    };
    if (getMoreContact && captchaContainer && moreContactContainer) {
        let captchaLoading = false;
        let captchaLoaded = false;
        getMoreContact.addEventListener('click', function () {
            if (captchaLoading || captchaLoaded) return;
            try {
                captchaLoading = true;
                captchaStatus.textContent = content[langKey].captchaLoading;
                captchaStatus.removeAttribute('style');
                // let captchaOnLoadBound = false;
                // const checkCaptchaLoaded = () => {
                //     const captchaIframe = captchaContainer.querySelector('iframe');
                //     if (captchaIframe && !captchaOnLoadBound) {
                //         captchaIframe.onload = function () {
                //             captchaStatus.textContent = '';
                //             captchaStatus.style.display = 'none';
                //             captchaLoading = false;
                //             captchaLoaded = true;
                //             clearInterval(checkCaptchaLoaded);
                //         }
                //         captchaOnLoadBound = true;
                //     }
                // };
                // checkCaptchaLoaded();
                // setInterval(checkCaptchaLoaded, 100);
                const widgetId = hcaptcha.render(captchaContainer, {
                    sitekey,
                    hl: langKey,
                    theme: document.documentElement.dataset.colorScheme,
                    callback: function (token) {
                        hcaptcha.remove(widgetId);
                        captchaContainer.style.display = 'none';
                        moreContactContainer.innerHTML = `<p>${content[langKey].moreContactLoading}</p>`;
                        fetchMoreContact(token);
                    }
                });
                // 直接从 res 引入验证码后加载很快，没有好的办法检测何时加载完成。于是这里直接认为加载完成。
                captchaStatus.textContent = '';
                captchaStatus.style.display = 'none';
                captchaLoading = false;
                captchaLoaded = true;
            } catch (e) {
                console.error('hCaptcha render failed:', e);
                captchaStatus.textContent = content[langKey].captchaLoadingFailed;
                captchaStatus.removeAttribute('style');
                captchaLoading = false;
                captchaLoaded = false;
            }
        });
    }
}

// 参考 https://github.com/YunYouJun/hexo-tag-common/blob/main/js/index.js
// 额外添加 tabindex 与按键监听。
function registerTabsTag() {
    // Binding `nav-tabs` & `tab-content` by real time permalink changing.
    document.querySelectorAll('.tabs ul.nav-tabs .tab').forEach((element) => {
        const tabClick = (event) => {
            // Prevent selected tab to select again.
            if (element.classList.contains('active')) return;
            event.preventDefault();
            // Add & Remove active class on `nav-tabs` & `tab-content`.
            [...element.parentNode.children].forEach((target) => {
                target.classList.toggle('active', target === element);
                if (target.classList.contains('active'))
                    target.removeAttribute('tabindex');
                else
                    target.setAttribute('tabindex', '0');
            });
            // https://stackoverflow.com/questions/20306204/using-queryselector-with-ids-that-are-numbers
            const tActive = document.getElementById(
                element.querySelector('a').dataset.target
            );
            [...tActive.parentNode.children].forEach((target) => {
                target.classList.toggle('active', target === tActive);
                if (target.classList.contains('active'))
                    target.removeAttribute('tabindex');
                else
                    target.setAttribute('tabindex', '0');
            });
            // Trigger event
            tActive.dispatchEvent(
                new Event('tabs:click', {
                    bubbles: true,
                })
            );
        };
        const tabTargetId = element.querySelector('a').dataset.target;
        // element.role = 'tab';
        element.setAttribute('aria-controls', tabTargetId);
        if (element.classList.contains('active'))
            element.removeAttribute('tabindex');
        else
            element.setAttribute('tabindex', '0');
        element.addEventListener('click', (e) => {
            tabClick(e);
        });
        element.addEventListener('keydown', (e) => {
            if (e.code === 'Enter' || e.code === 'Space')
                tabClick(e);
        });
    });
    // https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tab_role#example
    // 结构不兼容。
    // [...document.getElementsByClassName('tabs')].forEach(e => e.role = 'tablist');
    // [...document.getElementsByClassName('tab-pane')].forEach(e => e.role = 'tabpanel');
    window.dispatchEvent(new Event('tabs:register'));
}

function fixNetEaseMusic() {
    // 修复移动端网易云音乐外链。
    if (!!navigator.userAgent.match(
        /(phone|pad|pod|Mobile|iPhone|iPad|iPod|ios|Android|Windows Phone|Symbian|BlackBerry|WebOS|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG)/i
    )) {
        [...document.getElementsByTagName('iframe')].forEach(element => {
            if (element.src.includes('music.163.com/'))
                element.src = element.src.replace('music.163.com/', 'music.163.com/m/');
        });
    }
}

function fixVkMusic() {
    document.querySelectorAll('[id^=vk_playlist_]').forEach((el) => {
        const parent = el.parentElement;
        let srcScript = el.nextElementSibling;
        let loaderScript = srcScript.nextElementSibling;
        const newLoaderScript = document.createElement('script');
        newLoaderScript.type = loaderScript.type;
        newLoaderScript.innerHTML = loaderScript.innerHTML;
        const newSrcScript = document.createElement('script');
        newSrcScript.type = srcScript.type;
        newSrcScript.src = srcScript.src;
        window['script_load_' + el.id] = () => {
            parent.appendChild(newLoaderScript);
        };
        newSrcScript.setAttribute('onload', 'script_load_' + el.id + '()');
        parent.removeChild(srcScript);
        parent.removeChild(loaderScript);
        srcScript = loaderScript = null;
        parent.appendChild(newSrcScript);
    });
}

function getCurrentLang() {
    let currentLang;
    const langs = [spLang, localStorage.getItem('lang'), ...navigator.languages];
    for (const lang of langs) {
        if (!lang) continue;
        if (lang in content) {
            currentLang = lang;
            break;
        } else if (lang.startsWith('zh')) {
            currentLang = 'zh-CN';
            break;
        } else if (lang.startsWith('en')) {
            currentLang = 'en-US';
            break;
        } else if (lang.startsWith('ru')) {
            currentLang = 'ru-RU';
            break;
        }
    }
    if (!currentLang)
        currentLang = 'en-US';
    return currentLang;
}

let hideImgLoading;
let showImgError;
let initPswp;

function setGiscusLang(lang) {
    const iframe = document.querySelector('iframe.giscus-frame');
    if (!iframe) return;
    let giscusLang = lang;
    switch (lang) {
        case 'zh-CN':
            giscusLang = 'zh-CN';
            break;
        case 'en-US':
            giscusLang = 'en';
            break;
        case 'ru-RU':
            giscusLang = 'ru';
            break;
    }
    iframe.contentWindow.postMessage({
        giscus: {
            setConfig: {
                lang: giscusLang
            }
        }
    }, 'https://giscus.app');
}

function generateOpenGraph(langKey, langContent) {
    let tagTemplate = '';
    const keywordsArray = langContent.keywords.split(',');
    for (const keyword of keywordsArray)
        tagTemplate += `<meta property="article:tag" content="${keyword}">\n`;
    let ogTemplate = `
    <meta property="og:type" content="website">
    <meta property="og:title" content="${langContent.name}">
    <meta property="og:url" content="https://yukun.bio/">
    <meta property="og:site_name" content="${langContent.name}">
    <meta property="og:description" content="${langContent.desc}">
    <meta property="og:locale" content="${langKey}">
    <meta property="article:author" content="${langContent.name}">
    ${tagTemplate}
    <meta name="twitter:card" content="summary">
    <meta name="twitter:image" content="${langContent.profiles[0].src}">`;
    return ogTemplate;
}

function generateJsonLd(langKey, langContent) {
    const linksArrayString = JSON.stringify(langContent.links.map(l => l.href));
    let jsonLdTemplate = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "@language": "${langKey}",
        "name": "${langContent.name}",
        "description": "${langContent.desc}",
        "keywords": "${langContent.keywords}",
        "url": "https://yukun.bio/",
        "mainEntity": {
          "@type": "Person",
          "name": "${langContent.name}",
          "description": "${langContent.desc}",
          "image": "${langContent.profiles[0].src}",
          "url": "https://yukun.bio/",
          "sameAs": ${linksArrayString}
        }
      }
    </script>`;
    return jsonLdTemplate;
}

function updateInterface(langKey) {
    const langContent = content[langKey];
    document.documentElement.setAttribute('lang', langKey);
    document.documentElement.setAttribute('dir', langContent.dir);
    document.getElementById('name').textContent = document.title = langContent.name;
    document.querySelector('meta[name="description"]').setAttribute('content', langContent.desc);
    const keywordsEle = document.querySelector('meta[name="keywords"]');
    keywordsEle.setAttribute('content', langContent.keywords);
    document.querySelectorAll('meta[property^="og"],meta[property^="article"],meta[name^="twitter"],script[type="application/ld+json"]').forEach(e => e.remove());
    keywordsEle.insertAdjacentHTML('afterend', generateOpenGraph(langKey, langContent) + generateJsonLd(langKey, langContent));
    const akaElement = document.getElementById('aka');
    if (langContent.aka) {
        akaElement.textContent = langContent.aka;
        akaElement.style.display = 'block';
    } else {
        akaElement.textContent = langContent.aka;
        akaElement.style.display = 'none';
    }
    document.getElementById('desc').textContent = langContent.desc;
    const links = document.getElementById('links');
    links.innerHTML = '';
    for (const link of langContent.links) {
        let iconWrapper = document.createElement('span');
        iconWrapper.setAttribute('class', 'icon-wrapper');
        const newLink = document.createElement('a');
        newLink.title = link.title;
        newLink.setAttribute('class', `icon un-i-${link.icon}`);
        newLink.href = link.href;
        newLink.target = '_blank';
        newLink.rel = 'noopener';
        iconWrapper.append(newLink);
        links.append(iconWrapper);
    }
    setGiscusLang(langKey);
    const currentColorScheme = document.documentElement.dataset.colorScheme;
    if (currentColorScheme)
        setGiscusColorScheme(currentColorScheme);
    else
        setGiscusColorScheme('preferred_color_scheme');
    document.querySelector('label[for="select-color-scheme"]').textContent = langContent.colorScheme.label;
    document.querySelectorAll('#select-color-scheme option').forEach(el => {
        el.textContent = langContent.colorScheme[el.value];
    });
    document.querySelector('label[for="select-lang"]').textContent = langContent.langLabel;
    /** render markdown */
    const markdownContent = langContent.markdown;
    document.getElementById('rendered-content').innerHTML = marked.parse(markdownContent);
    const imgs = [...document.getElementsByTagName('img')];
    imgs.forEach(function (img) {
        img.className += ' img-loading';
    });
    hideImgLoading = function (e) {
        let loadedImg = e.target;
        loadedImg.className = loadedImg.className.replace(' img-loading', '');
        loadedImg.style.aspectRatio = null;
    };
    showImgError = function (e) {
        let loadedImg = e.target;
        loadedImg.removeAttribute('tabindex');
        loadedImg.className = loadedImg.className.replace(' img-loading', '') + ' img-error';
    };
    const profile = document.getElementById('profile');
    if (hideImgLoading) profile.removeEventListener('load', hideImgLoading);
    if (showImgError) profile.removeEventListener('error', showImgError);
    profile.addEventListener('load', hideImgLoading);
    profile.addEventListener('error', showImgError);
    // profile.width = langContent.profiles[0].width;
    // profile.height = langContent.profiles[0].height;
    profile.style.aspectRatio = langContent.profiles[0].width / langContent.profiles[0].height;
    profile.setAttribute('src', langContent.profiles[0].src);
    profile.setAttribute('alt', langContent.profiles[0].alt);
    if (initPswp) {
        profile.removeEventListener('click', initPswp);
        profile.removeEventListener('keydown', initPswp);
    }
    initPswp = function (e) {
        if (e.target.className.includes('img-error')) return;
        if (e.type === 'click' || e.type === 'keydown' && (e.code === 'Enter' || e.code === 'Space')) {
            e.preventDefault();
            const psOptions = {
                dataSource: langContent.profiles
            };
            Object.assign(psOptions, langContent.photoSwipe);
            const pswp = new PhotoSwipe(psOptions);
            pswp.init();
        }
    };
    profile.addEventListener('click', initPswp);
    profile.addEventListener('keydown', initPswp);
    const profileImgCounter = document.getElementById('profile-img-counter');
    profileImgCounter.title = langContent.profileImgCounterTitle;
    profileImgCounter.innerHTML = '<span class="icon un-i-uil:images un-me-1"></span>' + langContent.profiles.length;
    if (langContent.profiles.length > 1)
        profileImgCounter.style.display = 'block';
    else
        profileImgCounter.style.display = 'none';
    const renderedImgs = [...document.querySelectorAll('#rendered-content img[data-width][data-height]')];
    if (renderedImgs.length > 0) {
        renderedImgs.forEach(function (img) {
            img.style.aspectRatio = img.getAttribute('data-width') / img.getAttribute('data-height');
            const initPswpRendered = function (e) {
                if (e.target.className.includes('img-error')) return;
                if (e.type === 'click' || e.type === 'keydown' && (e.code === 'Enter' || e.code === 'Space')) {
                    e.preventDefault();
                    const imgIndex = renderedImgs.indexOf(e.target);
                    if (imgIndex !== -1) {
                        const psRenderedOptions = {
                            dataSource: renderedImgs.filter(i => !i.className.includes('img-error')).map(i => { return { src: i.src, width: i.getAttribute('data-width'), height: i.getAttribute('data-height'), alt: i.alt }; }),
                            index: imgIndex
                        };
                        Object.assign(psRenderedOptions, langContent.photoSwipe);
                        const pswpRendered = new PhotoSwipe(psRenderedOptions);
                        pswpRendered.init();
                    }
                }
            };
            img.addEventListener('load', hideImgLoading);
            img.addEventListener('error', showImgError);
            img.addEventListener('click', initPswpRendered);
            img.addEventListener('keydown', initPswpRendered);
        });
    }
    setGetMoreContact(langKey);
    registerTabsTag();
    fixNetEaseMusic();
    fixVkMusic();
}

function domContentLoadedHandler(eDomContentLoaded) {
    const currentLang = getCurrentLang();
    const langSelect = document.getElementById('select-lang');
    for (const key of Object.keys(content)) {
        let option = document.createElement('option');
        option.value = key;
        option.textContent = content[key].langName;
        langSelect.append(option);
    }
    langSelect.value = currentLang;
    langSelect.addEventListener('change', function (e) {
        localStorage.setItem('lang', e.target.value);
        updateInterface(e.target.value);
    });
    localStorage.setItem('lang', currentLang);
    updateInterface(currentLang);
    document.getElementById('select-color-scheme').value = currentColorScheme;
    document.getElementById('select-color-scheme').addEventListener('change', function (e) {
        setColorScheme(e.target.value);
    });
    document.getElementById('content').removeAttribute('aria-hidden');
    document.getElementById('utils').removeAttribute('aria-hidden');
    document.getElementById('loading').style.display = 'none';
}

let giscusInited = false;

function handleGiscusMessage(event) {
    if (event.origin !== 'https://giscus.app') return;
    if (!(typeof event.data === 'object' && event.data.giscus)) return;
    const giscusData = event.data.giscus;
    // 首次 resize 认为是加载完成。
    if (giscusData.resizeHeight && !giscusInited) {
        const giscusFrame = document.getElementsByClassName('giscus-frame')[0];
        // giscusFrame.style.display = 'unset';
        giscusFrame.removeAttribute('scrolling');
        setGiscusLang(getCurrentLang());
        const currentColorScheme = document.documentElement.dataset.colorScheme;
        if (currentColorScheme)
            setGiscusColorScheme(currentColorScheme);
        else
            setGiscusColorScheme('preferred_color_scheme');
        giscusInited = true;
    }
}

window.addEventListener('message', handleGiscusMessage);

document.documentElement.addEventListener('forcedcolorschange', function (e) {
    // 强制颜色（高对比度）下取消手动设置的颜色方案。
    if (e.detail.active) {
        document.getElementById('select-color-scheme').value = 'system';
        setColorScheme('system');
    }
});

function handleForcedColorsChange(matches) {
    document.documentElement.dispatchEvent(new CustomEvent('forcedcolorschange', {
        detail: {
            active: matches
        }
    }));
}

const forcedColorsQuery = window.matchMedia('(forced-colors: active)');
forcedColorsQuery.addEventListener('change', e => handleForcedColorsChange(e.matches));

setInterval(() => {
    const current = document.activeElement;
    if (current.classList.contains('giscus-frame')) {
        if (!current.classList.contains('giscus-frame-focus'))
            current.classList.add('giscus-frame-focus');
    }
    else {
        document.querySelector('.giscus-frame.giscus-frame-focus')?.classList.remove('giscus-frame-focus');
    }
}, 200);

document.getElementById('loading').removeAttribute('aria-hidden');

if (document.readyState !== 'loading')
    domContentLoadedHandler();
else
    document.addEventListener('DOMContentLoaded', domContentLoadedHandler);
