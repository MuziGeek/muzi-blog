var import_hexo_util = require("hexo-util");
const randomBG = function(count = 1, image_server = null, image_list = []) {
  let i;
  if (image_server) {
    if (count && count > 1) {
      const arr = new Array(count);
      for (i = 0; i < arr.length; i++) {
        arr[i] = image_server + "?" + Math.floor(Math.random() * 999999);
      }
      return arr;
    }
    return image_server + "?" + Math.floor(Math.random() * 999999);
  }
  if (count && count > 1) {
    let shuffled = image_list.slice(0);
    while (shuffled.length <= 6) {
      shuffled = shuffled.concat(image_list.slice(0));
    }
    i = shuffled.length;
    const min = i - count;
    let temp;
    let index;
    while (i-- > min) {
      index = Math.floor((i + 1) * Math.random());
      temp = shuffled[index];
      shuffled[index] = shuffled[i];
      shuffled[i] = temp;
    }
    return shuffled.slice(min);
  }
  return image_list[Math.floor(Math.random() * image_list.length)];
};
hexo.extend.helper.register("shokax_inject", function(point) {
  return hexo.theme.config.injects[point].map((item) => this.partial(item.layout, item.locals, item.options)).join("");
});
hexo.extend.helper.register("_url", function(path, text, options = {}) {
  if (!path) {
    return;
  }
  let tag = "a";
  let attrs = { href: import_hexo_util.url_for.call(this, path), class: void 0, external: void 0, rel: void 0, "data-url": void 0 };
  for (const key in options) {
    attrs[key] = options[key];
  }
  if (attrs.class && Array.isArray(attrs.class)) {
    attrs.class = attrs.class.join(" ");
  }
  return (0, import_hexo_util.htmlTag)(tag, attrs, decodeURI(text), false);
});
hexo.extend.helper.register("_image_url", function(img, path = "") {
  const { statics } = hexo.theme.config;
  const { post_asset_folder } = hexo.config;
  if (img.startsWith("//") || img.startsWith("http")) {
    return img;
  } else {
    return import_hexo_util.url_for.call(this, statics + (post_asset_folder ? path : "") + img);
  }
});
hexo.extend.helper.register("_cover", function(item, num) {
  const { image_server, image_list } = hexo.theme.config;
  if (item.cover) {
    return this._image_url(item.cover, item.path);
  } else if (item.photos && item.photos.length > 0) {
    return this._image_url(item.photos[0], item.path);
  } else {
    return randomBG(num || 1, image_server, image_list);
  }
});
hexo.extend.helper.register("_cover_index", function(item) {
  const { index_images, image_list, image_server } = hexo.theme.config;
  if (item.cover) {
    return this._image_url(item.cover, item.path);
  } else if (item.photos && item.photos.length > 0) {
    return this._image_url(item.photos[0], item.path);
  } else {
    return randomBG(6, image_server, index_images.length === 0 ? image_list : index_images);
  }
});
hexo.extend.helper.register("_permapath", function(str) {
  const { permalink } = hexo.config;
  let url = str.replace(/index\.html$/, "");
  if (!permalink.endsWith(".html")) {
    url = url.replace(/\.html$/, "");
  }
  return url;
});
hexo.extend.helper.register("canonical", function() {
  return `<link rel="canonical" href="${this._permapath(this.url)}">`;
});
hexo.extend.helper.register("i18n_path", function(language) {
  const { path, lang } = this.page;
  const base = path.startsWith(lang) ? path.slice(lang.length + 1) : path;
  return import_hexo_util.url_for.call(this, `${this.languages.indexOf(language) === 0 ? "" : "/" + language}/${base}`);
});
hexo.extend.helper.register("language_name", function(language) {
  const name = hexo.theme.i18n.__(language)("name");
  return name === "name" ? language : name;
});
hexo.extend.helper.register("random_color", function() {
  const arr = [];
  for (let i = 0; i < 3; i++) {
    arr.push(Math.floor(Math.random() * 128 + 128));
  }
  const [r, g, b] = arr;
  return `#${r.toString(16).length > 1 ? r.toString(16) : "0" + r.toString(16)}${g.toString(16).length > 1 ? g.toString(16) : "0" + g.toString(16)}${b.toString(16).length > 1 ? b.toString(16) : "0" + b.toString(16)}`;
});
