"use strict";
var import_promises = require("node:fs/promises");
hexo.extend.generator.register("images", async function(locals) {
  const theme = hexo.theme.config;
  const dir = "source/_data/" + theme.assets + "/";
  try {
    await (0, import_promises.readdir)(dir);
  } catch (e) {
    return;
  }
  const result = [];
  const files = await (0, import_promises.readdir)(dir);
  files.forEach(async (file) => {
    const fileContent = await (0, import_promises.readFile)(dir + file);
    result.push({
      path: theme.assets + "/" + file,
      data: fileContent
    });
  });
  return result;
});
