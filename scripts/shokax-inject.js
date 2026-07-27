'use strict';

const root = hexo.config.root.endsWith('/') ? hexo.config.root : `${hexo.config.root}/`;
const asset = (pathname) => `${root}${pathname}`;
const chatAssistant = hexo.config.theme_config?.chat_assistant || {};
const injectionLocals = {
  chatAssistant,
  live2d: chatAssistant.live2d || {},
  siteUrl: hexo.config.url,
  chatWidgetCss: asset('css/chat-widget.css?v=1.3'),
  shokaxCustomCss: asset('css/muzi-shokax-custom.css?v=1.0'),
  chatWidgetJs: asset('js/chat-widget.js?v=1.3'),
  live2dJs: asset('js/muzi-live2d.js?v=1.0')
};

hexo.extend.filter.register('theme_inject', (injects) => {
  injects.bodyEnd.file('muzi-chat-live2d', 'theme_injects/muzi-chat-live2d.pug', injectionLocals);
});
