module.exports = (async () => {
    const { default: UnoCSS } = await import('@unocss/postcss');
    return {
        plugins: [
            UnoCSS()
        ]
    };
})();
