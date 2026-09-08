const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
module.exports = function load(relative, globals = {}, modules = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => {
      if (modules[name]) return modules[name];
      if (name.startsWith('.') || name.startsWith('@/')) {
        const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.join(path.dirname(relative), name);
        const target = [base, base + '.ts', base + '.tsx'].find(file => fs.existsSync(path.join(__dirname, '..', file)) && fs.statSync(path.join(__dirname, '..', file)).isFile());
        if (target) return load(target, globals, modules);
      }
      return require(name);
    },
    URL, Error, Promise, setTimeout, clearTimeout, ...globals });
  return exports;
};
