(function () {
  function getIsDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ||
      localStorage.getItem('theme') === 'dark';
  }

  window.initMuziLive2D = function initMuziLive2D(models) {
    if (typeof OML2D === 'undefined') {
      console.warn('OML2D not loaded, skip Live2D init');
      return;
    }

    function initLive2D() {
      var isDark = getIsDark();
      return OML2D.loadOml2d({
        dockedPosition: 'right',
        primaryColor: isDark ? '#a855f7' : '#22d3ee',
        sayHello: false,
        menus: { disable: true },
        statusBar: { disable: true },
        models: [{
          path: isDark ? models.darkModel : models.lightModel,
          position: [0, 50],
          scale: 0.08,
          stageStyle: { width: 180, height: 200 }
        }],
        tips: {
          style: {
            width: 200,
            fontSize: '13px',
            offsetX: 0,
            offsetY: 60
          },
          idleTips: {
            wordTheDay: false,
            message: [
              '有什么可以帮你的吗？点击我开始聊天~',
              '欢迎来到木子小站！',
              '今天也要元气满满哦~',
              '想了解什么技术问题？问我就对了！',
              '点击我可以和博客助手聊天哦~',
              '喵~ 需要帮助吗？'
            ],
            interval: 8000
          }
        }
      });
    }

    function bindStageClick() {
      var stageObserver = new MutationObserver(function () {
        var stage = document.querySelector('#oml2d-stage');
        if (!stage) return;

        stageObserver.disconnect();
        stage.style.cursor = 'pointer';
        stage.addEventListener('click', function () {
          if (window.ChatWidgetInstance) window.ChatWidgetInstance.toggle();
        });
      });
      stageObserver.observe(document.body, { childList: true, subtree: true });
    }

    initLive2D();
    bindStageClick();

    var lastTheme = getIsDark() ? 'dark' : 'light';
    var themeObserver = new MutationObserver(function () {
      var nowTheme = getIsDark() ? 'dark' : 'light';
      if (nowTheme === lastTheme) return;

      lastTheme = nowTheme;
      document.querySelectorAll('[id^="oml2d"]').forEach(function (element) {
        element.remove();
      });
      initLive2D();
      bindStageClick();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  };
}());
