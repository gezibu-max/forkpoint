#!/usr/bin/env node
import { createRequire as __forkpointCreateRequire } from "node:module";
const require = __forkpointCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/isexe/windows.js
var require_windows = __commonJS({
  "node_modules/isexe/windows.js"(exports, module) {
    "use strict";
    module.exports = isexe;
    isexe.sync = sync;
    var fs2 = __require("fs");
    function checkPathExt(path10, options) {
      var pathext = options.pathExt !== void 0 ? options.pathExt : process.env.PATHEXT;
      if (!pathext) {
        return true;
      }
      pathext = pathext.split(";");
      if (pathext.indexOf("") !== -1) {
        return true;
      }
      for (var i = 0; i < pathext.length; i++) {
        var p = pathext[i].toLowerCase();
        if (p && path10.substr(-p.length).toLowerCase() === p) {
          return true;
        }
      }
      return false;
    }
    function checkStat(stat, path10, options) {
      if (!stat.isSymbolicLink() && !stat.isFile()) {
        return false;
      }
      return checkPathExt(path10, options);
    }
    function isexe(path10, options, cb) {
      fs2.stat(path10, function(er, stat) {
        cb(er, er ? false : checkStat(stat, path10, options));
      });
    }
    function sync(path10, options) {
      return checkStat(fs2.statSync(path10), path10, options);
    }
  }
});

// node_modules/isexe/mode.js
var require_mode = __commonJS({
  "node_modules/isexe/mode.js"(exports, module) {
    "use strict";
    module.exports = isexe;
    isexe.sync = sync;
    var fs2 = __require("fs");
    function isexe(path10, options, cb) {
      fs2.stat(path10, function(er, stat) {
        cb(er, er ? false : checkStat(stat, options));
      });
    }
    function sync(path10, options) {
      return checkStat(fs2.statSync(path10), options);
    }
    function checkStat(stat, options) {
      return stat.isFile() && checkMode(stat, options);
    }
    function checkMode(stat, options) {
      var mod = stat.mode;
      var uid = stat.uid;
      var gid = stat.gid;
      var myUid = options.uid !== void 0 ? options.uid : process.getuid && process.getuid();
      var myGid = options.gid !== void 0 ? options.gid : process.getgid && process.getgid();
      var u = parseInt("100", 8);
      var g = parseInt("010", 8);
      var o = parseInt("001", 8);
      var ug = u | g;
      var ret = mod & o || mod & g && gid === myGid || mod & u && uid === myUid || mod & ug && myUid === 0;
      return ret;
    }
  }
});

// node_modules/isexe/index.js
var require_isexe = __commonJS({
  "node_modules/isexe/index.js"(exports, module) {
    "use strict";
    var fs2 = __require("fs");
    var core;
    if (process.platform === "win32" || global.TESTING_WINDOWS) {
      core = require_windows();
    } else {
      core = require_mode();
    }
    module.exports = isexe;
    isexe.sync = sync;
    function isexe(path10, options, cb) {
      if (typeof options === "function") {
        cb = options;
        options = {};
      }
      if (!cb) {
        if (typeof Promise !== "function") {
          throw new TypeError("callback not provided");
        }
        return new Promise(function(resolve, reject) {
          isexe(path10, options || {}, function(er, is) {
            if (er) {
              reject(er);
            } else {
              resolve(is);
            }
          });
        });
      }
      core(path10, options || {}, function(er, is) {
        if (er) {
          if (er.code === "EACCES" || options && options.ignoreErrors) {
            er = null;
            is = false;
          }
        }
        cb(er, is);
      });
    }
    function sync(path10, options) {
      try {
        return core.sync(path10, options || {});
      } catch (er) {
        if (options && options.ignoreErrors || er.code === "EACCES") {
          return false;
        } else {
          throw er;
        }
      }
    }
  }
});

// node_modules/which/which.js
var require_which = __commonJS({
  "node_modules/which/which.js"(exports, module) {
    "use strict";
    var isWindows = process.platform === "win32" || process.env.OSTYPE === "cygwin" || process.env.OSTYPE === "msys";
    var path10 = __require("path");
    var COLON = isWindows ? ";" : ":";
    var isexe = require_isexe();
    var getNotFoundError = (cmd) => Object.assign(new Error(`not found: ${cmd}`), { code: "ENOENT" });
    var getPathInfo = (cmd, opt) => {
      const colon = opt.colon || COLON;
      const pathEnv = cmd.match(/\//) || isWindows && cmd.match(/\\/) ? [""] : [
        // windows always checks the cwd first
        ...isWindows ? [process.cwd()] : [],
        ...(opt.path || process.env.PATH || /* istanbul ignore next: very unusual */
        "").split(colon)
      ];
      const pathExtExe = isWindows ? opt.pathExt || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM" : "";
      const pathExt = isWindows ? pathExtExe.split(colon) : [""];
      if (isWindows) {
        if (cmd.indexOf(".") !== -1 && pathExt[0] !== "")
          pathExt.unshift("");
      }
      return {
        pathEnv,
        pathExt,
        pathExtExe
      };
    };
    var which = (cmd, opt, cb) => {
      if (typeof opt === "function") {
        cb = opt;
        opt = {};
      }
      if (!opt)
        opt = {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      const step = (i) => new Promise((resolve, reject) => {
        if (i === pathEnv.length)
          return opt.all && found.length ? resolve(found) : reject(getNotFoundError(cmd));
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path10.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        resolve(subStep(p, i, 0));
      });
      const subStep = (p, i, ii) => new Promise((resolve, reject) => {
        if (ii === pathExt.length)
          return resolve(step(i + 1));
        const ext = pathExt[ii];
        isexe(p + ext, { pathExt: pathExtExe }, (er, is) => {
          if (!er && is) {
            if (opt.all)
              found.push(p + ext);
            else
              return resolve(p + ext);
          }
          return resolve(subStep(p, i, ii + 1));
        });
      });
      return cb ? step(0).then((res) => cb(null, res), cb) : step(0);
    };
    var whichSync = (cmd, opt) => {
      opt = opt || {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      for (let i = 0; i < pathEnv.length; i++) {
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path10.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        for (let j = 0; j < pathExt.length; j++) {
          const cur = p + pathExt[j];
          try {
            const is = isexe.sync(cur, { pathExt: pathExtExe });
            if (is) {
              if (opt.all)
                found.push(cur);
              else
                return cur;
            }
          } catch (ex) {
          }
        }
      }
      if (opt.all && found.length)
        return found;
      if (opt.nothrow)
        return null;
      throw getNotFoundError(cmd);
    };
    module.exports = which;
    which.sync = whichSync;
  }
});

// node_modules/path-key/index.js
var require_path_key = __commonJS({
  "node_modules/path-key/index.js"(exports, module) {
    "use strict";
    var pathKey = (options = {}) => {
      const environment = options.env || process.env;
      const platform = options.platform || process.platform;
      if (platform !== "win32") {
        return "PATH";
      }
      return Object.keys(environment).reverse().find((key) => key.toUpperCase() === "PATH") || "Path";
    };
    module.exports = pathKey;
    module.exports.default = pathKey;
  }
});

// node_modules/cross-spawn/lib/util/resolveCommand.js
var require_resolveCommand = __commonJS({
  "node_modules/cross-spawn/lib/util/resolveCommand.js"(exports, module) {
    "use strict";
    var path10 = __require("path");
    var which = require_which();
    var getPathKey = require_path_key();
    function resolveCommandAttempt(parsed, withoutPathExt) {
      const env = parsed.options.env || process.env;
      const cwd = process.cwd();
      const hasCustomCwd = parsed.options.cwd != null;
      const shouldSwitchCwd = hasCustomCwd && process.chdir !== void 0 && !process.chdir.disabled;
      if (shouldSwitchCwd) {
        try {
          process.chdir(parsed.options.cwd);
        } catch (err) {
        }
      }
      let resolved;
      try {
        resolved = which.sync(parsed.command, {
          path: env[getPathKey({ env })],
          pathExt: withoutPathExt ? path10.delimiter : void 0
        });
      } catch (e) {
      } finally {
        if (shouldSwitchCwd) {
          process.chdir(cwd);
        }
      }
      if (resolved) {
        resolved = path10.resolve(hasCustomCwd ? parsed.options.cwd : "", resolved);
      }
      return resolved;
    }
    function resolveCommand2(parsed) {
      return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
    }
    module.exports = resolveCommand2;
  }
});

// node_modules/cross-spawn/lib/util/escape.js
var require_escape = __commonJS({
  "node_modules/cross-spawn/lib/util/escape.js"(exports, module) {
    "use strict";
    var metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
    function escapeCommand(arg) {
      arg = arg.replace(metaCharsRegExp, "^$1");
      return arg;
    }
    function escapeArgument(arg, doubleEscapeMetaChars) {
      arg = `${arg}`;
      arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
      arg = arg.replace(/(?=(\\+?)?)\1$/, "$1$1");
      arg = `"${arg}"`;
      arg = arg.replace(metaCharsRegExp, "^$1");
      if (doubleEscapeMetaChars) {
        arg = arg.replace(metaCharsRegExp, "^$1");
      }
      return arg;
    }
    module.exports.command = escapeCommand;
    module.exports.argument = escapeArgument;
  }
});

// node_modules/shebang-regex/index.js
var require_shebang_regex = __commonJS({
  "node_modules/shebang-regex/index.js"(exports, module) {
    "use strict";
    module.exports = /^#!(.*)/;
  }
});

// node_modules/shebang-command/index.js
var require_shebang_command = __commonJS({
  "node_modules/shebang-command/index.js"(exports, module) {
    "use strict";
    var shebangRegex = require_shebang_regex();
    module.exports = (string = "") => {
      const match = string.match(shebangRegex);
      if (!match) {
        return null;
      }
      const [path10, argument] = match[0].replace(/#! ?/, "").split(" ");
      const binary = path10.split("/").pop();
      if (binary === "env") {
        return argument;
      }
      return argument ? `${binary} ${argument}` : binary;
    };
  }
});

// node_modules/cross-spawn/lib/util/readShebang.js
var require_readShebang = __commonJS({
  "node_modules/cross-spawn/lib/util/readShebang.js"(exports, module) {
    "use strict";
    var fs2 = __require("fs");
    var shebangCommand = require_shebang_command();
    function readShebang(command) {
      const size = 150;
      const buffer = Buffer.alloc(size);
      let fd;
      try {
        fd = fs2.openSync(command, "r");
        fs2.readSync(fd, buffer, 0, size, 0);
        fs2.closeSync(fd);
      } catch (e) {
      }
      return shebangCommand(buffer.toString());
    }
    module.exports = readShebang;
  }
});

// node_modules/cross-spawn/lib/parse.js
var require_parse = __commonJS({
  "node_modules/cross-spawn/lib/parse.js"(exports, module) {
    "use strict";
    var path10 = __require("path");
    var resolveCommand2 = require_resolveCommand();
    var escape = require_escape();
    var readShebang = require_readShebang();
    var isWin = process.platform === "win32";
    var isExecutableRegExp = /\.(?:com|exe)$/i;
    var isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
    function detectShebang(parsed) {
      parsed.file = resolveCommand2(parsed);
      const shebang = parsed.file && readShebang(parsed.file);
      if (shebang) {
        parsed.args.unshift(parsed.file);
        parsed.command = shebang;
        return resolveCommand2(parsed);
      }
      return parsed.file;
    }
    function parseNonShell(parsed) {
      if (!isWin) {
        return parsed;
      }
      const commandFile = detectShebang(parsed);
      const needsShell = !isExecutableRegExp.test(commandFile);
      if (parsed.options.forceShell || needsShell) {
        const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);
        parsed.command = path10.normalize(parsed.command);
        parsed.command = escape.command(parsed.command);
        parsed.args = parsed.args.map((arg) => escape.argument(arg, needsDoubleEscapeMetaChars));
        const shellCommand = [parsed.command].concat(parsed.args).join(" ");
        parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
        parsed.command = process.env.comspec || "cmd.exe";
        parsed.options.windowsVerbatimArguments = true;
      }
      return parsed;
    }
    function parse(command, args, options) {
      if (args && !Array.isArray(args)) {
        options = args;
        args = null;
      }
      args = args ? args.slice(0) : [];
      options = Object.assign({}, options);
      const parsed = {
        command,
        args,
        options,
        file: void 0,
        original: {
          command,
          args
        }
      };
      return options.shell ? parsed : parseNonShell(parsed);
    }
    module.exports = parse;
  }
});

// node_modules/cross-spawn/lib/enoent.js
var require_enoent = __commonJS({
  "node_modules/cross-spawn/lib/enoent.js"(exports, module) {
    "use strict";
    var isWin = process.platform === "win32";
    function notFoundError(original, syscall) {
      return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
        code: "ENOENT",
        errno: "ENOENT",
        syscall: `${syscall} ${original.command}`,
        path: original.command,
        spawnargs: original.args
      });
    }
    function hookChildProcess(cp, parsed) {
      if (!isWin) {
        return;
      }
      const originalEmit = cp.emit;
      cp.emit = function(name, arg1) {
        if (name === "exit") {
          const err = verifyENOENT(arg1, parsed);
          if (err) {
            return originalEmit.call(cp, "error", err);
          }
        }
        return originalEmit.apply(cp, arguments);
      };
    }
    function verifyENOENT(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawn");
      }
      return null;
    }
    function verifyENOENTSync(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawnSync");
      }
      return null;
    }
    module.exports = {
      hookChildProcess,
      verifyENOENT,
      verifyENOENTSync,
      notFoundError
    };
  }
});

// node_modules/cross-spawn/index.js
var require_cross_spawn = __commonJS({
  "node_modules/cross-spawn/index.js"(exports, module) {
    "use strict";
    var cp = __require("child_process");
    var parse = require_parse();
    var enoent = require_enoent();
    function spawn2(command, args, options) {
      const parsed = parse(command, args, options);
      const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);
      enoent.hookChildProcess(spawned, parsed);
      return spawned;
    }
    function spawnSync2(command, args, options) {
      const parsed = parse(command, args, options);
      const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);
      result.error = result.error || enoent.verifyENOENTSync(result.status, parsed);
      return result;
    }
    module.exports = spawn2;
    module.exports.spawn = spawn2;
    module.exports.sync = spawnSync2;
    module.exports._parse = parse;
    module.exports._enoent = enoent;
  }
});

// node_modules/commander/lib/error.js
var CommanderError = class extends Error {
  /**
   * Constructs the CommanderError class
   * @param {number} exitCode suggested exit code which could be used with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   */
  constructor(exitCode, code, message) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = exitCode;
    this.nestedError = void 0;
  }
};
var InvalidArgumentError = class extends CommanderError {
  /**
   * Constructs the InvalidArgumentError class
   * @param {string} [message] explanation of why argument is invalid
   */
  constructor(message) {
    super(1, "commander.invalidArgument", message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
  }
};

// node_modules/commander/lib/argument.js
var Argument = class {
  /**
   * Initialize a new command argument with the given name and description.
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @param {string} name
   * @param {string} [description]
   */
  constructor(name, description) {
    this.description = description || "";
    this.variadic = false;
    this.parseArg = void 0;
    this.defaultValue = void 0;
    this.defaultValueDescription = void 0;
    this.argChoices = void 0;
    switch (name[0]) {
      case "<":
        this.required = true;
        this._name = name.slice(1, -1);
        break;
      case "[":
        this.required = false;
        this._name = name.slice(1, -1);
        break;
      default:
        this.required = true;
        this._name = name;
        break;
    }
    if (this._name.endsWith("...")) {
      this.variadic = true;
      this._name = this._name.slice(0, -3);
    }
  }
  /**
   * Return argument name.
   *
   * @return {string}
   */
  name() {
    return this._name;
  }
  /**
   * @package
   */
  _collectValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }
    previous.push(value);
    return previous;
  }
  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {*} value
   * @param {string} [description]
   * @return {Argument}
   */
  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }
  /**
   * Set the custom handler for processing CLI command arguments into argument values.
   *
   * @param {Function} [fn]
   * @return {Argument}
   */
  argParser(fn) {
    this.parseArg = fn;
    return this;
  }
  /**
   * Only allow argument value to be one of choices.
   *
   * @param {string[]} values
   * @return {Argument}
   */
  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(
          `Allowed choices are ${this.argChoices.join(", ")}.`
        );
      }
      if (this.variadic) {
        return this._collectValue(arg, previous);
      }
      return arg;
    };
    return this;
  }
  /**
   * Make argument required.
   *
   * @returns {Argument}
   */
  argRequired() {
    this.required = true;
    return this;
  }
  /**
   * Make argument optional.
   *
   * @returns {Argument}
   */
  argOptional() {
    this.required = false;
    return this;
  }
};
function humanReadableArgName(arg) {
  const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
  return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
}

// node_modules/commander/lib/command.js
import { EventEmitter } from "node:events";
import childProcess from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import process2 from "node:process";
import { stripVTControlCharacters as stripVTControlCharacters2 } from "node:util";

// node_modules/commander/lib/help.js
import { stripVTControlCharacters } from "node:util";
var Help = class {
  constructor() {
    this.helpWidth = void 0;
    this.minWidthToWrap = 40;
    this.sortSubcommands = false;
    this.sortOptions = false;
    this.showGlobalOptions = false;
  }
  /**
   * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
   * and just before calling `formatHelp()`.
   *
   * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
   *
   * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
   */
  prepareContext(contextOptions) {
    this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
  }
  /**
   * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
   *
   * @param {Command} cmd
   * @returns {Command[]}
   */
  visibleCommands(cmd) {
    const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
    const helpCommand = cmd._getHelpCommand();
    if (helpCommand && !helpCommand._hidden) {
      visibleCommands.push(helpCommand);
    }
    if (this.sortSubcommands) {
      visibleCommands.sort((a, b) => {
        return a.name().localeCompare(b.name());
      });
    }
    return visibleCommands;
  }
  /**
   * Compare options for sort.
   *
   * @param {Option} a
   * @param {Option} b
   * @returns {number}
   */
  compareOptions(a, b) {
    const getSortKey = (option) => {
      return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
    };
    return getSortKey(a).localeCompare(getSortKey(b));
  }
  /**
   * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
   *
   * @param {Command} cmd
   * @returns {Option[]}
   */
  visibleOptions(cmd) {
    const visibleOptions = cmd.options.filter((option) => !option.hidden);
    const helpOption = cmd._getHelpOption();
    if (helpOption && !helpOption.hidden) {
      const removeShort = helpOption.short && cmd._findOption(helpOption.short);
      const removeLong = helpOption.long && cmd._findOption(helpOption.long);
      if (!removeShort && !removeLong) {
        visibleOptions.push(helpOption);
      } else if (helpOption.long && !removeLong) {
        visibleOptions.push(
          cmd.createOption(helpOption.long, helpOption.description)
        );
      } else if (helpOption.short && !removeShort) {
        visibleOptions.push(
          cmd.createOption(helpOption.short, helpOption.description)
        );
      }
    }
    if (this.sortOptions) {
      visibleOptions.sort(this.compareOptions);
    }
    return visibleOptions;
  }
  /**
   * Get an array of the visible global options. (Not including help.)
   *
   * @param {Command} cmd
   * @returns {Option[]}
   */
  visibleGlobalOptions(cmd) {
    if (!this.showGlobalOptions) return [];
    const globalOptions = [];
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      const visibleOptions = ancestorCmd.options.filter(
        (option) => !option.hidden
      );
      globalOptions.push(...visibleOptions);
    }
    if (this.sortOptions) {
      globalOptions.sort(this.compareOptions);
    }
    return globalOptions;
  }
  /**
   * Get an array of the arguments if any have a description.
   *
   * @param {Command} cmd
   * @returns {Argument[]}
   */
  visibleArguments(cmd) {
    if (cmd._argsDescription) {
      cmd.registeredArguments.forEach((argument) => {
        argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
      });
    }
    if (cmd.registeredArguments.find((argument) => argument.description)) {
      return cmd.registeredArguments;
    }
    return [];
  }
  /**
   * Get the command term to show in the list of subcommands.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  subcommandTerm(cmd) {
    const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
    return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
    (args ? " " + args : "");
  }
  /**
   * Get the option term to show in the list of options.
   *
   * @param {Option} option
   * @returns {string}
   */
  optionTerm(option) {
    return option.flags;
  }
  /**
   * Get the argument term to show in the list of arguments.
   *
   * @param {Argument} argument
   * @returns {string}
   */
  argumentTerm(argument) {
    return argument.name();
  }
  /**
   * Get the longest command term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestSubcommandTermLength(cmd, helper) {
    return helper.visibleCommands(cmd).reduce((max, command) => {
      return Math.max(
        max,
        this.displayWidth(
          helper.styleSubcommandTerm(helper.subcommandTerm(command))
        )
      );
    }, 0);
  }
  /**
   * Get the longest option term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestOptionTermLength(cmd, helper) {
    return helper.visibleOptions(cmd).reduce((max, option) => {
      return Math.max(
        max,
        this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
      );
    }, 0);
  }
  /**
   * Get the longest global option term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestGlobalOptionTermLength(cmd, helper) {
    return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
      return Math.max(
        max,
        this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
      );
    }, 0);
  }
  /**
   * Get the longest argument term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestArgumentTermLength(cmd, helper) {
    return helper.visibleArguments(cmd).reduce((max, argument) => {
      return Math.max(
        max,
        this.displayWidth(
          helper.styleArgumentTerm(helper.argumentTerm(argument))
        )
      );
    }, 0);
  }
  /**
   * Get the command usage to be displayed at the top of the built-in help.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  commandUsage(cmd) {
    let cmdName = cmd._name;
    if (cmd._aliases[0]) {
      cmdName = cmdName + "|" + cmd._aliases[0];
    }
    let ancestorCmdNames = "";
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
    }
    return ancestorCmdNames + cmdName + " " + cmd.usage();
  }
  /**
   * Get the description for the command.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  commandDescription(cmd) {
    return cmd.description();
  }
  /**
   * Get the subcommand summary to show in the list of subcommands.
   * (Fallback to description for backwards compatibility.)
   *
   * @param {Command} cmd
   * @returns {string}
   */
  subcommandDescription(cmd) {
    return cmd.summary() || cmd.description();
  }
  /**
   * Get the option description to show in the list of options.
   *
   * @param {Option} option
   * @return {string}
   */
  optionDescription(option) {
    const extraInfo = [];
    if (option.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
      );
    }
    if (option.defaultValue !== void 0) {
      const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
      if (showDefault) {
        extraInfo.push(
          `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
        );
      }
    }
    if (option.presetArg !== void 0 && option.optional) {
      extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
    }
    if (option.envVar !== void 0) {
      extraInfo.push(`env: ${option.envVar}`);
    }
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(", ")})`;
      if (option.description) {
        return `${option.description} ${extraDescription}`;
      }
      return extraDescription;
    }
    return option.description;
  }
  /**
   * Get the argument description to show in the list of arguments.
   *
   * @param {Argument} argument
   * @return {string}
   */
  argumentDescription(argument) {
    const extraInfo = [];
    if (argument.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
      );
    }
    if (argument.defaultValue !== void 0) {
      extraInfo.push(
        `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
      );
    }
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(", ")})`;
      if (argument.description) {
        return `${argument.description} ${extraDescription}`;
      }
      return extraDescription;
    }
    return argument.description;
  }
  /**
   * Format a list of items, given a heading and an array of formatted items.
   *
   * @param {string} heading
   * @param {string[]} items
   * @param {Help} helper
   * @returns string[]
   */
  formatItemList(heading, items, helper) {
    if (items.length === 0) return [];
    return [helper.styleTitle(heading), ...items, ""];
  }
  /**
   * Group items by their help group heading.
   *
   * @param {Command[] | Option[]} unsortedItems
   * @param {Command[] | Option[]} visibleItems
   * @param {Function} getGroup
   * @returns {Map<string, Command[] | Option[]>}
   */
  groupItems(unsortedItems, visibleItems, getGroup) {
    const result = /* @__PURE__ */ new Map();
    unsortedItems.forEach((item) => {
      const group = getGroup(item);
      if (!result.has(group)) result.set(group, []);
    });
    visibleItems.forEach((item) => {
      const group = getGroup(item);
      if (!result.has(group)) {
        result.set(group, []);
      }
      result.get(group).push(item);
    });
    return result;
  }
  /**
   * Generate the built-in help text.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {string}
   */
  formatHelp(cmd, helper) {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth ?? 80;
    function callFormatItem(term, description) {
      return helper.formatItem(term, termWidth, description, helper);
    }
    let output = [
      `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
      ""
    ];
    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([
        helper.boxWrap(
          helper.styleCommandDescription(commandDescription),
          helpWidth
        ),
        ""
      ]);
    }
    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return callFormatItem(
        helper.styleArgumentTerm(helper.argumentTerm(argument)),
        helper.styleArgumentDescription(helper.argumentDescription(argument))
      );
    });
    output = output.concat(
      this.formatItemList("Arguments:", argumentList, helper)
    );
    const optionGroups = this.groupItems(
      cmd.options,
      helper.visibleOptions(cmd),
      (option) => option.helpGroupHeading ?? "Options:"
    );
    optionGroups.forEach((options, group) => {
      const optionList = options.map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option))
        );
      });
      output = output.concat(this.formatItemList(group, optionList, helper));
    });
    if (helper.showGlobalOptions) {
      const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option))
        );
      });
      output = output.concat(
        this.formatItemList("Global Options:", globalOptionList, helper)
      );
    }
    const commandGroups = this.groupItems(
      cmd.commands,
      helper.visibleCommands(cmd),
      (sub) => sub.helpGroup() || "Commands:"
    );
    commandGroups.forEach((commands, group) => {
      const commandList = commands.map((sub) => {
        return callFormatItem(
          helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
          helper.styleSubcommandDescription(helper.subcommandDescription(sub))
        );
      });
      output = output.concat(this.formatItemList(group, commandList, helper));
    });
    return output.join("\n");
  }
  /**
   * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
   *
   * @param {string} str
   * @returns {number}
   */
  displayWidth(str) {
    return stripVTControlCharacters(str).length;
  }
  /**
   * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
   *
   * @param {string} str
   * @returns {string}
   */
  styleTitle(str) {
    return str;
  }
  styleUsage(str) {
    return str.split(" ").map((word) => {
      if (word === "[options]") return this.styleOptionText(word);
      if (word === "[command]") return this.styleSubcommandText(word);
      if (word[0] === "[" || word[0] === "<")
        return this.styleArgumentText(word);
      return this.styleCommandText(word);
    }).join(" ");
  }
  styleCommandDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleOptionDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleSubcommandDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleArgumentDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleDescriptionText(str) {
    return str;
  }
  styleOptionTerm(str) {
    return this.styleOptionText(str);
  }
  styleSubcommandTerm(str) {
    return str.split(" ").map((word) => {
      if (word === "[options]") return this.styleOptionText(word);
      if (word[0] === "[" || word[0] === "<")
        return this.styleArgumentText(word);
      return this.styleSubcommandText(word);
    }).join(" ");
  }
  styleArgumentTerm(str) {
    return this.styleArgumentText(str);
  }
  styleOptionText(str) {
    return str;
  }
  styleArgumentText(str) {
    return str;
  }
  styleSubcommandText(str) {
    return str;
  }
  styleCommandText(str) {
    return str;
  }
  /**
   * Calculate the pad width from the maximum term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  padWidth(cmd, helper) {
    return Math.max(
      helper.longestOptionTermLength(cmd, helper),
      helper.longestGlobalOptionTermLength(cmd, helper),
      helper.longestSubcommandTermLength(cmd, helper),
      helper.longestArgumentTermLength(cmd, helper)
    );
  }
  /**
   * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
   *
   * @param {string} str
   * @returns {boolean}
   */
  preformatted(str) {
    return /\n[^\S\r\n]/.test(str);
  }
  /**
   * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
   *
   * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
   *   TTT  DDD DDDD
   *        DD DDD
   *
   * @param {string} term
   * @param {number} termWidth
   * @param {string} description
   * @param {Help} helper
   * @returns {string}
   */
  formatItem(term, termWidth, description, helper) {
    const itemIndent = 2;
    const itemIndentStr = " ".repeat(itemIndent);
    if (!description) return itemIndentStr + term;
    const paddedTerm = term.padEnd(
      termWidth + term.length - helper.displayWidth(term)
    );
    const spacerWidth = 2;
    const helpWidth = this.helpWidth ?? 80;
    const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
    let formattedDescription;
    if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
      formattedDescription = description;
    } else {
      const wrappedDescription = helper.boxWrap(description, remainingWidth);
      formattedDescription = wrappedDescription.replace(
        /\n/g,
        "\n" + " ".repeat(termWidth + spacerWidth)
      );
    }
    return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
  }
  /**
   * Wrap a string at whitespace, preserving existing line breaks.
   * Wrapping is skipped if the width is less than `minWidthToWrap`.
   *
   * @param {string} str
   * @param {number} width
   * @returns {string}
   */
  boxWrap(str, width) {
    if (width < this.minWidthToWrap) return str;
    const rawLines = str.split(/\r\n|\n/);
    const chunkPattern = /[\s]*[^\s]+/g;
    const wrappedLines = [];
    rawLines.forEach((line) => {
      const chunks = line.match(chunkPattern);
      if (chunks === null) {
        wrappedLines.push("");
        return;
      }
      let sumChunks = [chunks.shift()];
      let sumWidth = this.displayWidth(sumChunks[0]);
      chunks.forEach((chunk) => {
        const visibleWidth = this.displayWidth(chunk);
        if (sumWidth + visibleWidth <= width) {
          sumChunks.push(chunk);
          sumWidth += visibleWidth;
          return;
        }
        wrappedLines.push(sumChunks.join(""));
        const nextChunk = chunk.trimStart();
        sumChunks = [nextChunk];
        sumWidth = this.displayWidth(nextChunk);
      });
      wrappedLines.push(sumChunks.join(""));
    });
    return wrappedLines.join("\n");
  }
};

// node_modules/commander/lib/option.js
var Option = class {
  /**
   * Initialize a new `Option` with the given `flags` and `description`.
   *
   * @param {string} flags
   * @param {string} [description]
   */
  constructor(flags, description) {
    this.flags = flags;
    this.description = description || "";
    this.required = flags.includes("<");
    this.optional = flags.includes("[");
    this.variadic = /\w\.\.\.[>\]]$/.test(flags);
    this.mandatory = false;
    const optionFlags = splitOptionFlags(flags);
    this.short = optionFlags.shortFlag;
    this.long = optionFlags.longFlag;
    this.negate = false;
    if (this.long) {
      this.negate = this.long.startsWith("--no-");
    }
    this.defaultValue = void 0;
    this.defaultValueDescription = void 0;
    this.presetArg = void 0;
    this.envVar = void 0;
    this.parseArg = void 0;
    this.hidden = false;
    this.argChoices = void 0;
    this.conflictsWith = [];
    this.implied = void 0;
    this.helpGroupHeading = void 0;
  }
  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {*} value
   * @param {string} [description]
   * @return {Option}
   */
  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }
  /**
   * Preset to use when option used without option-argument, especially optional but also boolean and negated.
   * The custom processing (parseArg) is called.
   *
   * @example
   * new Option('--color').default('GREYSCALE').preset('RGB');
   * new Option('--donate [amount]').preset('20').argParser(parseFloat);
   *
   * @param {*} arg
   * @return {Option}
   */
  preset(arg) {
    this.presetArg = arg;
    return this;
  }
  /**
   * Add option name(s) that conflict with this option.
   * An error will be displayed if conflicting options are found during parsing.
   *
   * @example
   * new Option('--rgb').conflicts('cmyk');
   * new Option('--js').conflicts(['ts', 'jsx']);
   *
   * @param {(string | string[])} names
   * @return {Option}
   */
  conflicts(names) {
    this.conflictsWith = this.conflictsWith.concat(names);
    return this;
  }
  /**
   * Specify implied option values for when this option is set and the implied options are not.
   *
   * The custom processing (parseArg) is not called on the implied values.
   *
   * @example
   * program
   *   .addOption(new Option('--log', 'write logging information to file'))
   *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
   *
   * @param {object} impliedOptionValues
   * @return {Option}
   */
  implies(impliedOptionValues) {
    let newImplied = impliedOptionValues;
    if (typeof impliedOptionValues === "string") {
      newImplied = { [impliedOptionValues]: true };
    }
    this.implied = Object.assign(this.implied || {}, newImplied);
    return this;
  }
  /**
   * Set environment variable to check for option value.
   *
   * An environment variable is only used if when processed the current option value is
   * undefined, or the source of the current value is 'default' or 'config' or 'env'.
   *
   * @param {string} name
   * @return {Option}
   */
  env(name) {
    this.envVar = name;
    return this;
  }
  /**
   * Set the custom handler for processing CLI option arguments into option values.
   *
   * @param {Function} [fn]
   * @return {Option}
   */
  argParser(fn) {
    this.parseArg = fn;
    return this;
  }
  /**
   * Whether the option is mandatory and must have a value after parsing.
   *
   * @param {boolean} [mandatory=true]
   * @return {Option}
   */
  makeOptionMandatory(mandatory = true) {
    this.mandatory = !!mandatory;
    return this;
  }
  /**
   * Hide option in help.
   *
   * @param {boolean} [hide=true]
   * @return {Option}
   */
  hideHelp(hide = true) {
    this.hidden = !!hide;
    return this;
  }
  /**
   * @package
   */
  _collectValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }
    previous.push(value);
    return previous;
  }
  /**
   * Only allow option value to be one of choices.
   *
   * @param {string[]} values
   * @return {Option}
   */
  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(
          `Allowed choices are ${this.argChoices.join(", ")}.`
        );
      }
      if (this.variadic) {
        return this._collectValue(arg, previous);
      }
      return arg;
    };
    return this;
  }
  /**
   * Return option name.
   *
   * @return {string}
   */
  name() {
    if (this.long) {
      return this.long.replace(/^--/, "");
    }
    return this.short.replace(/^-/, "");
  }
  /**
   * Return option name, in a camelcase format that can be used
   * as an object attribute key.
   *
   * @return {string}
   */
  attributeName() {
    if (this.negate) {
      return camelcase(this.name().replace(/^no-/, ""));
    }
    return camelcase(this.name());
  }
  /**
   * Set the help group heading.
   *
   * @param {string} heading
   * @return {Option}
   */
  helpGroup(heading) {
    this.helpGroupHeading = heading;
    return this;
  }
  /**
   * Check if `arg` matches the short or long flag.
   *
   * @param {string} arg
   * @return {boolean}
   * @package
   */
  is(arg) {
    return this.short === arg || this.long === arg;
  }
  /**
   * Return whether a boolean option.
   *
   * Options are one of boolean, negated, required argument, or optional argument.
   *
   * @return {boolean}
   * @package
   */
  isBoolean() {
    return !this.required && !this.optional && !this.negate;
  }
};
var DualOptions = class {
  /**
   * @param {Option[]} options
   */
  constructor(options) {
    this.positiveOptions = /* @__PURE__ */ new Map();
    this.negativeOptions = /* @__PURE__ */ new Map();
    this.dualOptions = /* @__PURE__ */ new Set();
    options.forEach((option) => {
      if (option.negate) {
        this.negativeOptions.set(option.attributeName(), option);
      } else {
        this.positiveOptions.set(option.attributeName(), option);
      }
    });
    this.negativeOptions.forEach((value, key) => {
      if (this.positiveOptions.has(key)) {
        this.dualOptions.add(key);
      }
    });
  }
  /**
   * Did the value come from the option, and not from possible matching dual option?
   *
   * @param {*} value
   * @param {Option} option
   * @returns {boolean}
   */
  valueFromOption(value, option) {
    const optionKey = option.attributeName();
    if (!this.dualOptions.has(optionKey)) return true;
    const preset = this.negativeOptions.get(optionKey).presetArg;
    const negativeValue = preset !== void 0 ? preset : false;
    return option.negate === (negativeValue === value);
  }
};
function camelcase(str) {
  return str.split("-").reduce((str2, word) => {
    return str2 + word[0].toUpperCase() + word.slice(1);
  });
}
function splitOptionFlags(flags) {
  let shortFlag;
  let longFlag;
  const shortFlagExp = /^-[^-]$/;
  const longFlagExp = /^--[^-]/;
  const flagParts = flags.split(/[ |,]+/).concat("guard");
  if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
  if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
  if (!shortFlag && shortFlagExp.test(flagParts[0]))
    shortFlag = flagParts.shift();
  if (!shortFlag && longFlagExp.test(flagParts[0])) {
    shortFlag = longFlag;
    longFlag = flagParts.shift();
  }
  if (flagParts[0].startsWith("-")) {
    const unsupportedFlag = flagParts[0];
    const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
    if (/^-[^-][^-]/.test(unsupportedFlag))
      throw new Error(
        `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
      );
    if (shortFlagExp.test(unsupportedFlag))
      throw new Error(`${baseError}
- too many short flags`);
    if (longFlagExp.test(unsupportedFlag))
      throw new Error(`${baseError}
- too many long flags`);
    throw new Error(`${baseError}
- unrecognised flag format`);
  }
  if (shortFlag === void 0 && longFlag === void 0)
    throw new Error(
      `option creation failed due to no flags found in '${flags}'.`
    );
  return { shortFlag, longFlag };
}

// node_modules/commander/lib/suggestSimilar.js
var maxDistance = 3;
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > maxDistance)
    return Math.max(a.length, b.length);
  const d = [];
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    d[0][j] = j;
  }
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      let cost;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
      } else {
        cost = 1;
      }
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        // deletion
        d[i][j - 1] + 1,
        // insertion
        d[i - 1][j - 1] + cost
        // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
function suggestSimilar(word, candidates) {
  if (!candidates || candidates.length === 0) return "";
  candidates = Array.from(new Set(candidates));
  const searchingOptions = word.startsWith("--");
  if (searchingOptions) {
    word = word.slice(2);
    candidates = candidates.map((candidate) => candidate.slice(2));
  }
  let similar = [];
  let bestDistance = maxDistance;
  const minSimilarity = 0.4;
  candidates.forEach((candidate) => {
    if (candidate.length <= 1) return;
    const distance = editDistance(word, candidate);
    const length = Math.max(word.length, candidate.length);
    const similarity = (length - distance) / length;
    if (similarity > minSimilarity) {
      if (distance < bestDistance) {
        bestDistance = distance;
        similar = [candidate];
      } else if (distance === bestDistance) {
        similar.push(candidate);
      }
    }
  });
  similar.sort((a, b) => a.localeCompare(b));
  if (searchingOptions) {
    similar = similar.map((candidate) => `--${candidate}`);
  }
  if (similar.length > 1) {
    return `
(Did you mean one of ${similar.join(", ")}?)`;
  }
  if (similar.length === 1) {
    return `
(Did you mean ${similar[0]}?)`;
  }
  return "";
}

// node_modules/commander/lib/command.js
var Command = class _Command extends EventEmitter {
  /**
   * Initialize a new `Command`.
   *
   * @param {string} [name]
   */
  constructor(name) {
    super();
    this.commands = [];
    this.options = [];
    this.parent = null;
    this._allowUnknownOption = false;
    this._allowExcessArguments = false;
    this.registeredArguments = [];
    this._args = this.registeredArguments;
    this.args = [];
    this.rawArgs = [];
    this.processedArgs = [];
    this._scriptPath = null;
    this._name = name || "";
    this._optionValues = {};
    this._optionValueSources = {};
    this._storeOptionsAsProperties = false;
    this._actionHandler = null;
    this._executableHandler = false;
    this._executableFile = null;
    this._executableDir = null;
    this._defaultCommandName = null;
    this._exitCallback = null;
    this._aliases = [];
    this._combineFlagAndOptionalValue = true;
    this._description = "";
    this._summary = "";
    this._argsDescription = void 0;
    this._enablePositionalOptions = false;
    this._passThroughOptions = false;
    this._lifeCycleHooks = {};
    this._showHelpAfterError = false;
    this._showSuggestionAfterError = true;
    this._savedState = null;
    this._outputConfiguration = {
      writeOut: (str) => process2.stdout.write(str),
      writeErr: (str) => process2.stderr.write(str),
      outputError: (str, write) => write(str),
      getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
      getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
      getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
      getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
      stripColor: (str) => stripVTControlCharacters2(str)
    };
    this._hidden = false;
    this._helpOption = void 0;
    this._addImplicitHelpCommand = void 0;
    this._helpCommand = void 0;
    this._helpConfiguration = {};
    this._helpGroupHeading = void 0;
    this._defaultCommandGroup = void 0;
    this._defaultOptionGroup = void 0;
  }
  /**
   * Copy settings that are useful to have in common across root command and subcommands.
   *
   * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
   *
   * @param {Command} sourceCommand
   * @return {Command} `this` command for chaining
   */
  copyInheritedSettings(sourceCommand) {
    this._outputConfiguration = sourceCommand._outputConfiguration;
    this._helpOption = sourceCommand._helpOption;
    this._helpCommand = sourceCommand._helpCommand;
    this._helpConfiguration = sourceCommand._helpConfiguration;
    this._exitCallback = sourceCommand._exitCallback;
    this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
    this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
    this._allowExcessArguments = sourceCommand._allowExcessArguments;
    this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
    this._showHelpAfterError = sourceCommand._showHelpAfterError;
    this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
    return this;
  }
  /**
   * @returns {Command[]}
   * @private
   */
  _getCommandAndAncestors() {
    const result = [];
    for (let command = this; command; command = command.parent) {
      result.push(command);
    }
    return result;
  }
  /**
   * Define a command.
   *
   * There are two styles of command: pay attention to where to put the description.
   *
   * @example
   * // Command implemented using action handler (description is supplied separately to `.command`)
   * program
   *   .command('clone <source> [destination]')
   *   .description('clone a repository into a newly created directory')
   *   .action((source, destination) => {
   *     console.log('clone command called');
   *   });
   *
   * // Command implemented using separate executable file (description is second parameter to `.command`)
   * program
   *   .command('start <service>', 'start named service')
   *   .command('stop [service]', 'stop named service, or all if no name supplied');
   *
   * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
   * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
   * @param {object} [execOpts] - configuration options (for executable)
   * @return {Command} returns new command for action handler, or `this` for executable command
   */
  command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
    let desc = actionOptsOrExecDesc;
    let opts = execOpts;
    if (typeof desc === "object" && desc !== null) {
      opts = desc;
      desc = null;
    }
    opts = opts || {};
    const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
    const cmd = this.createCommand(name);
    if (desc) {
      cmd.description(desc);
      cmd._executableHandler = true;
    }
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    cmd._hidden = !!(opts.noHelp || opts.hidden);
    cmd._executableFile = opts.executableFile || null;
    if (args) cmd.arguments(args);
    this._registerCommand(cmd);
    cmd.parent = this;
    cmd.copyInheritedSettings(this);
    if (desc) return this;
    return cmd;
  }
  /**
   * Factory routine to create a new unattached command.
   *
   * See .command() for creating an attached subcommand, which uses this routine to
   * create the command. You can override createCommand to customise subcommands.
   *
   * @param {string} [name]
   * @return {Command} new command
   */
  createCommand(name) {
    return new _Command(name);
  }
  /**
   * You can customise the help with a subclass of Help by overriding createHelp,
   * or by overriding Help properties using configureHelp().
   *
   * @return {Help}
   */
  createHelp() {
    return Object.assign(new Help(), this.configureHelp());
  }
  /**
   * You can customise the help by overriding Help properties using configureHelp(),
   * or with a subclass of Help by overriding createHelp().
   *
   * @param {object} [configuration] - configuration options
   * @return {(Command | object)} `this` command for chaining, or stored configuration
   */
  configureHelp(configuration) {
    if (configuration === void 0) return this._helpConfiguration;
    this._helpConfiguration = configuration;
    return this;
  }
  /**
   * The default output goes to stdout and stderr. You can customise this for special
   * applications. You can also customise the display of errors by overriding outputError.
   *
   * The configuration properties are all functions:
   *
   *     // change how output being written, defaults to stdout and stderr
   *     writeOut(str)
   *     writeErr(str)
   *     // change how output being written for errors, defaults to writeErr
   *     outputError(str, write) // used for displaying errors and not used for displaying help
   *     // specify width for wrapping help
   *     getOutHelpWidth()
   *     getErrHelpWidth()
   *     // color support, currently only used with Help
   *     getOutHasColors()
   *     getErrHasColors()
   *     stripColor() // used to remove ANSI escape codes if output does not have colors
   *
   * @param {object} [configuration] - configuration options
   * @return {(Command | object)} `this` command for chaining, or stored configuration
   */
  configureOutput(configuration) {
    if (configuration === void 0) return this._outputConfiguration;
    this._outputConfiguration = {
      ...this._outputConfiguration,
      ...configuration
    };
    return this;
  }
  /**
   * Display the help or a custom message after an error occurs.
   *
   * @param {(boolean|string)} [displayHelp]
   * @return {Command} `this` command for chaining
   */
  showHelpAfterError(displayHelp = true) {
    if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
    this._showHelpAfterError = displayHelp;
    return this;
  }
  /**
   * Display suggestion of similar commands for unknown commands, or options for unknown options.
   *
   * @param {boolean} [displaySuggestion]
   * @return {Command} `this` command for chaining
   */
  showSuggestionAfterError(displaySuggestion = true) {
    this._showSuggestionAfterError = !!displaySuggestion;
    return this;
  }
  /**
   * Add a prepared subcommand.
   *
   * See .command() for creating an attached subcommand which inherits settings from its parent.
   *
   * @param {Command} cmd - new subcommand
   * @param {object} [opts] - configuration options
   * @return {Command} `this` command for chaining
   */
  addCommand(cmd, opts) {
    if (!cmd._name) {
      throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
    }
    opts = opts || {};
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    if (opts.noHelp || opts.hidden) cmd._hidden = true;
    this._registerCommand(cmd);
    cmd.parent = this;
    cmd._checkForBrokenPassThrough();
    return this;
  }
  /**
   * Factory routine to create a new unattached argument.
   *
   * See .argument() for creating an attached argument, which uses this routine to
   * create the argument. You can override createArgument to return a custom argument.
   *
   * @param {string} name
   * @param {string} [description]
   * @return {Argument} new argument
   */
  createArgument(name, description) {
    return new Argument(name, description);
  }
  /**
   * Define argument syntax for command.
   *
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @example
   * program.argument('<input-file>');
   * program.argument('[output-file]');
   *
   * @param {string} name
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom argument processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  argument(name, description, parseArg, defaultValue) {
    const argument = this.createArgument(name, description);
    if (typeof parseArg === "function") {
      argument.default(defaultValue).argParser(parseArg);
    } else {
      argument.default(parseArg);
    }
    this.addArgument(argument);
    return this;
  }
  /**
   * Define argument syntax for command, adding multiple at once (without descriptions).
   *
   * See also .argument().
   *
   * @example
   * program.arguments('<cmd> [env]');
   *
   * @param {string} names
   * @return {Command} `this` command for chaining
   */
  arguments(names) {
    names.trim().split(/ +/).forEach((detail) => {
      this.argument(detail);
    });
    return this;
  }
  /**
   * Define argument syntax for command, adding a prepared argument.
   *
   * @param {Argument} argument
   * @return {Command} `this` command for chaining
   */
  addArgument(argument) {
    const previousArgument = this.registeredArguments.slice(-1)[0];
    if (previousArgument?.variadic) {
      throw new Error(
        `only the last argument can be variadic '${previousArgument.name()}'`
      );
    }
    if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
      throw new Error(
        `a default value for a required argument is never used: '${argument.name()}'`
      );
    }
    this.registeredArguments.push(argument);
    return this;
  }
  /**
   * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
   *
   * @example
   *    program.helpCommand('help [cmd]');
   *    program.helpCommand('help [cmd]', 'show help');
   *    program.helpCommand(false); // suppress default help command
   *    program.helpCommand(true); // add help command even if no subcommands
   *
   * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
   * @param {string} [description] - custom description
   * @return {Command} `this` command for chaining
   */
  helpCommand(enableOrNameAndArgs, description) {
    if (typeof enableOrNameAndArgs === "boolean") {
      this._addImplicitHelpCommand = enableOrNameAndArgs;
      if (enableOrNameAndArgs && this._defaultCommandGroup) {
        this._initCommandGroup(this._getHelpCommand());
      }
      return this;
    }
    const nameAndArgs = enableOrNameAndArgs ?? "help [command]";
    const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
    const helpDescription = description ?? "display help for command";
    const helpCommand = this.createCommand(helpName);
    helpCommand.helpOption(false);
    if (helpArgs) helpCommand.arguments(helpArgs);
    if (helpDescription) helpCommand.description(helpDescription);
    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
    return this;
  }
  /**
   * Add prepared custom help command.
   *
   * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
   * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
   * @return {Command} `this` command for chaining
   */
  addHelpCommand(helpCommand, deprecatedDescription) {
    if (typeof helpCommand !== "object") {
      this.helpCommand(helpCommand, deprecatedDescription);
      return this;
    }
    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    this._initCommandGroup(helpCommand);
    return this;
  }
  /**
   * Lazy create help command.
   *
   * @return {(Command|null)}
   * @package
   */
  _getHelpCommand() {
    const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
    if (hasImplicitHelpCommand) {
      if (this._helpCommand === void 0) {
        this.helpCommand(void 0, void 0);
      }
      return this._helpCommand;
    }
    return null;
  }
  /**
   * Add hook for life cycle event.
   *
   * @param {string} event
   * @param {Function} listener
   * @return {Command} `this` command for chaining
   */
  hook(event, listener) {
    const allowedValues = ["preSubcommand", "preAction", "postAction"];
    if (!allowedValues.includes(event)) {
      throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    if (this._lifeCycleHooks[event]) {
      this._lifeCycleHooks[event].push(listener);
    } else {
      this._lifeCycleHooks[event] = [listener];
    }
    return this;
  }
  /**
   * Register callback to use as replacement for calling process.exit.
   *
   * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
   * @return {Command} `this` command for chaining
   */
  exitOverride(fn) {
    if (fn) {
      this._exitCallback = fn;
    } else {
      this._exitCallback = (err) => {
        if (err.code !== "commander.executeSubCommandAsync") {
          throw err;
        } else {
        }
      };
    }
    return this;
  }
  /**
   * Call process.exit, and _exitCallback if defined.
   *
   * @param {number} exitCode exit code for using with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   * @return never
   * @private
   */
  _exit(exitCode, code, message) {
    if (this._exitCallback) {
      this._exitCallback(new CommanderError(exitCode, code, message));
    }
    process2.exit(exitCode);
  }
  /**
   * Register callback `fn` for the command.
   *
   * @example
   * program
   *   .command('serve')
   *   .description('start service')
   *   .action(function() {
   *      // do work here
   *   });
   *
   * @param {Function} fn
   * @return {Command} `this` command for chaining
   */
  action(fn) {
    const listener = (args) => {
      const expectedArgsCount = this.registeredArguments.length;
      const actionArgs = args.slice(0, expectedArgsCount);
      if (this._storeOptionsAsProperties) {
        actionArgs[expectedArgsCount] = this;
      } else {
        actionArgs[expectedArgsCount] = this.opts();
      }
      actionArgs.push(this);
      return fn.apply(this, actionArgs);
    };
    this._actionHandler = listener;
    return this;
  }
  /**
   * Factory routine to create a new unattached option.
   *
   * See .option() for creating an attached option, which uses this routine to
   * create the option. You can override createOption to return a custom option.
   *
   * @param {string} flags
   * @param {string} [description]
   * @return {Option} new option
   */
  createOption(flags, description) {
    return new Option(flags, description);
  }
  /**
   * Wrap parseArgs to catch 'commander.invalidArgument'.
   *
   * @param {(Option | Argument)} target
   * @param {string} value
   * @param {*} previous
   * @param {string} invalidArgumentMessage
   * @private
   */
  _callParseArg(target, value, previous, invalidArgumentMessage) {
    try {
      return target.parseArg(value, previous);
    } catch (err) {
      if (err.code === "commander.invalidArgument") {
        const message = `${invalidArgumentMessage} ${err.message}`;
        this.error(message, { exitCode: err.exitCode, code: err.code });
      }
      throw err;
    }
  }
  /**
   * Check for option flag conflicts.
   * Register option if no conflicts found, or throw on conflict.
   *
   * @param {Option} option
   * @private
   */
  _registerOption(option) {
    const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
    if (matchingOption) {
      const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
      throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
    }
    this._initOptionGroup(option);
    this.options.push(option);
  }
  /**
   * Check for command name and alias conflicts with existing commands.
   * Register command if no conflicts found, or throw on conflict.
   *
   * @param {Command} command
   * @private
   */
  _registerCommand(command) {
    const knownBy = (cmd) => {
      return [cmd.name()].concat(cmd.aliases());
    };
    const alreadyUsed = knownBy(command).find(
      (name) => this._findCommand(name)
    );
    if (alreadyUsed) {
      const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
      const newCmd = knownBy(command).join("|");
      throw new Error(
        `cannot add command '${newCmd}' as already have command '${existingCmd}'`
      );
    }
    this._initCommandGroup(command);
    this.commands.push(command);
  }
  /**
   * Add an option.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addOption(option) {
    this._registerOption(option);
    const oname = option.name();
    const name = option.attributeName();
    if (option.defaultValue !== void 0) {
      this.setOptionValueWithSource(name, option.defaultValue, "default");
    }
    const handleOptionValue = (val, invalidValueMessage, valueSource) => {
      if (val == null && option.presetArg !== void 0) {
        val = option.presetArg;
      }
      const oldValue = this.getOptionValue(name);
      if (val !== null && option.parseArg) {
        val = this._callParseArg(option, val, oldValue, invalidValueMessage);
      } else if (val !== null && option.variadic) {
        val = option._collectValue(val, oldValue);
      }
      if (val == null) {
        if (option.negate) {
          val = false;
        } else if (option.isBoolean() || option.optional) {
          val = true;
        } else {
          val = "";
        }
      }
      this.setOptionValueWithSource(name, val, valueSource);
    };
    this.on("option:" + oname, (val) => {
      const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
      handleOptionValue(val, invalidValueMessage, "cli");
    });
    if (option.envVar) {
      this.on("optionEnv:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "env");
      });
    }
    return this;
  }
  /**
   * Internal implementation shared by .option() and .requiredOption()
   *
   * @return {Command} `this` command for chaining
   * @private
   */
  _optionEx(config, flags, description, fn, defaultValue) {
    if (typeof flags === "object" && flags instanceof Option) {
      throw new Error(
        "To add an Option object use addOption() instead of option() or requiredOption()"
      );
    }
    const option = this.createOption(flags, description);
    option.makeOptionMandatory(!!config.mandatory);
    if (typeof fn === "function") {
      option.default(defaultValue).argParser(fn);
    } else if (fn instanceof RegExp) {
      const regex = fn;
      fn = (val, def) => {
        const m = regex.exec(val);
        return m ? m[0] : def;
      };
      option.default(defaultValue).argParser(fn);
    } else {
      option.default(fn);
    }
    return this.addOption(option);
  }
  /**
   * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
   * option-argument is indicated by `<>` and an optional option-argument by `[]`.
   *
   * See the README for more details, and see also addOption() and requiredOption().
   *
   * @example
   * program
   *     .option('-p, --pepper', 'add pepper')
   *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
   *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
   *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  option(flags, description, parseArg, defaultValue) {
    return this._optionEx({}, flags, description, parseArg, defaultValue);
  }
  /**
   * Add a required option which must have a value after parsing. This usually means
   * the option must be specified on the command line. (Otherwise the same as .option().)
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  requiredOption(flags, description, parseArg, defaultValue) {
    return this._optionEx(
      { mandatory: true },
      flags,
      description,
      parseArg,
      defaultValue
    );
  }
  /**
   * Alter parsing of short flags with optional values.
   *
   * @example
   * // for `.option('-f,--flag [value]'):
   * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
   * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
   *
   * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
   * @return {Command} `this` command for chaining
   */
  combineFlagAndOptionalValue(combine = true) {
    this._combineFlagAndOptionalValue = !!combine;
    return this;
  }
  /**
   * Allow unknown options on the command line.
   *
   * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
   * @return {Command} `this` command for chaining
   */
  allowUnknownOption(allowUnknown = true) {
    this._allowUnknownOption = !!allowUnknown;
    return this;
  }
  /**
   * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
   *
   * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
   * @return {Command} `this` command for chaining
   */
  allowExcessArguments(allowExcess = true) {
    this._allowExcessArguments = !!allowExcess;
    return this;
  }
  /**
   * Enable positional options. Positional means global options are specified before subcommands which lets
   * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
   * The default behaviour is non-positional and global options may appear anywhere on the command line.
   *
   * @param {boolean} [positional]
   * @return {Command} `this` command for chaining
   */
  enablePositionalOptions(positional = true) {
    this._enablePositionalOptions = !!positional;
    return this;
  }
  /**
   * Pass through options that come after command-arguments rather than treat them as command-options,
   * so actual command-options come before command-arguments. Turning this on for a subcommand requires
   * positional options to have been enabled on the program (parent commands).
   * The default behaviour is non-positional and options may appear before or after command-arguments.
   *
   * @param {boolean} [passThrough] for unknown options.
   * @return {Command} `this` command for chaining
   */
  passThroughOptions(passThrough = true) {
    this._passThroughOptions = !!passThrough;
    this._checkForBrokenPassThrough();
    return this;
  }
  /**
   * @private
   */
  _checkForBrokenPassThrough() {
    if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
      throw new Error(
        `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
      );
    }
  }
  /**
   * Whether to store option values as properties on command object,
   * or store separately (specify false). In both cases the option values can be accessed using .opts().
   *
   * @param {boolean} [storeAsProperties=true]
   * @return {Command} `this` command for chaining
   */
  storeOptionsAsProperties(storeAsProperties = true) {
    if (this.options.length) {
      throw new Error("call .storeOptionsAsProperties() before adding options");
    }
    if (Object.keys(this._optionValues).length) {
      throw new Error(
        "call .storeOptionsAsProperties() before setting option values"
      );
    }
    this._storeOptionsAsProperties = !!storeAsProperties;
    return this;
  }
  /**
   * Retrieve option value.
   *
   * @param {string} key
   * @return {object} value
   */
  getOptionValue(key) {
    if (this._storeOptionsAsProperties) {
      return this[key];
    }
    return this._optionValues[key];
  }
  /**
   * Store option value.
   *
   * @param {string} key
   * @param {object} value
   * @return {Command} `this` command for chaining
   */
  setOptionValue(key, value) {
    return this.setOptionValueWithSource(key, value, void 0);
  }
  /**
   * Store option value and where the value came from.
   *
   * @param {string} key
   * @param {object} value
   * @param {string} source - expected values are default/config/env/cli/implied
   * @return {Command} `this` command for chaining
   */
  setOptionValueWithSource(key, value, source) {
    if (this._storeOptionsAsProperties) {
      this[key] = value;
    } else {
      this._optionValues[key] = value;
    }
    this._optionValueSources[key] = source;
    return this;
  }
  /**
   * Get source of option value.
   * Expected values are default | config | env | cli | implied
   *
   * @param {string} key
   * @return {string}
   */
  getOptionValueSource(key) {
    return this._optionValueSources[key];
  }
  /**
   * Get source of option value. See also .optsWithGlobals().
   * Expected values are default | config | env | cli | implied
   *
   * @param {string} key
   * @return {string}
   */
  getOptionValueSourceWithGlobals(key) {
    let source;
    this._getCommandAndAncestors().forEach((cmd) => {
      if (cmd.getOptionValueSource(key) !== void 0) {
        source = cmd.getOptionValueSource(key);
      }
    });
    return source;
  }
  /**
   * Get user arguments from implied or explicit arguments.
   * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
   *
   * @private
   */
  _prepareUserArgs(argv2, parseOptions) {
    if (argv2 !== void 0 && !Array.isArray(argv2)) {
      throw new Error("first parameter to parse must be array or undefined");
    }
    parseOptions = parseOptions || {};
    if (argv2 === void 0 && parseOptions.from === void 0) {
      if (process2.versions?.electron) {
        parseOptions.from = "electron";
      }
      const execArgv = process2.execArgv ?? [];
      if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
        parseOptions.from = "eval";
      }
    }
    if (argv2 === void 0) {
      argv2 = process2.argv;
    }
    this.rawArgs = argv2.slice();
    let userArgs;
    switch (parseOptions.from) {
      case void 0:
      case "node":
        this._scriptPath = argv2[1];
        userArgs = argv2.slice(2);
        break;
      case "electron":
        if (process2.defaultApp) {
          this._scriptPath = argv2[1];
          userArgs = argv2.slice(2);
        } else {
          userArgs = argv2.slice(1);
        }
        break;
      case "user":
        userArgs = argv2.slice(0);
        break;
      case "eval":
        userArgs = argv2.slice(1);
        break;
      default:
        throw new Error(
          `unexpected parse option { from: '${parseOptions.from}' }`
        );
    }
    if (!this._name && this._scriptPath)
      this.nameFromFilename(this._scriptPath);
    this._name = this._name || "program";
    return userArgs;
  }
  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Use parseAsync instead of parse if any of your action handlers are async.
   *
   * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
   *
   * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
   * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
   * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
   * - `'user'`: just user arguments
   *
   * @example
   * program.parse(); // parse process.argv and auto-detect electron and special node flags
   * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
   * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv] - optional, defaults to process.argv
   * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
   * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
   * @return {Command} `this` command for chaining
   */
  parse(argv2, parseOptions) {
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv2, parseOptions);
    this._parseCommand([], userArgs);
    return this;
  }
  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
   *
   * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
   * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
   * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
   * - `'user'`: just user arguments
   *
   * @example
   * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
   * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
   * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv]
   * @param {object} [parseOptions]
   * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
   * @return {Promise}
   */
  async parseAsync(argv2, parseOptions) {
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv2, parseOptions);
    await this._parseCommand([], userArgs);
    return this;
  }
  _prepareForParse() {
    if (this._savedState === null) {
      this.options.filter(
        (option) => option.negate && option.defaultValue === void 0 && this.getOptionValue(option.attributeName()) === void 0
      ).forEach((option) => {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(
            option.attributeName(),
            true,
            "default"
          );
        }
      });
      this.saveStateBeforeParse();
    } else {
      this.restoreStateBeforeParse();
    }
  }
  /**
   * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
   * Not usually called directly, but available for subclasses to save their custom state.
   *
   * This is called in a lazy way. Only commands used in parsing chain will have state saved.
   */
  saveStateBeforeParse() {
    this._savedState = {
      // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
      _name: this._name,
      // option values before parse have default values (including false for negated options)
      // shallow clones
      _optionValues: { ...this._optionValues },
      _optionValueSources: { ...this._optionValueSources }
    };
  }
  /**
   * Restore state before parse for calls after the first.
   * Not usually called directly, but available for subclasses to save their custom state.
   *
   * This is called in a lazy way. Only commands used in parsing chain will have state restored.
   */
  restoreStateBeforeParse() {
    if (this._storeOptionsAsProperties)
      throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
    this._name = this._savedState._name;
    this._scriptPath = null;
    this.rawArgs = [];
    this._optionValues = { ...this._savedState._optionValues };
    this._optionValueSources = { ...this._savedState._optionValueSources };
    this.args = [];
    this.processedArgs = [];
  }
  /**
   * Throw if expected executable is missing. Add lots of help for author.
   *
   * @param {string} executableFile
   * @param {string} executableDir
   * @param {string} subcommandName
   */
  _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
    if (fs.existsSync(executableFile)) return;
    const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
    const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
    throw new Error(executableMissing);
  }
  /**
   * Execute a sub-command executable.
   *
   * @private
   */
  _executeSubCommand(subcommand, args) {
    args = args.slice();
    const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
    function findFile(baseDir, baseName) {
      const localBin = path.resolve(baseDir, baseName);
      if (fs.existsSync(localBin)) return localBin;
      if (sourceExt.includes(path.extname(baseName))) return void 0;
      const foundExt = sourceExt.find(
        (ext) => fs.existsSync(`${localBin}${ext}`)
      );
      if (foundExt) return `${localBin}${foundExt}`;
      return void 0;
    }
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();
    let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
    let executableDir = this._executableDir || "";
    if (this._scriptPath) {
      let resolvedScriptPath;
      try {
        resolvedScriptPath = fs.realpathSync(this._scriptPath);
      } catch {
        resolvedScriptPath = this._scriptPath;
      }
      executableDir = path.resolve(
        path.dirname(resolvedScriptPath),
        executableDir
      );
    }
    if (executableDir) {
      let localFile = findFile(executableDir, executableFile);
      if (!localFile && !subcommand._executableFile && this._scriptPath) {
        const legacyName = path.basename(
          this._scriptPath,
          path.extname(this._scriptPath)
        );
        if (legacyName !== this._name) {
          localFile = findFile(
            executableDir,
            `${legacyName}-${subcommand._name}`
          );
        }
      }
      executableFile = localFile || executableFile;
    }
    const launchWithNode = sourceExt.includes(path.extname(executableFile));
    let proc;
    if (process2.platform !== "win32") {
      if (launchWithNode) {
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
      } else {
        proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
      }
    } else {
      this._checkForMissingExecutable(
        executableFile,
        executableDir,
        subcommand._name
      );
      args.unshift(executableFile);
      args = incrementNodeInspectorPort(process2.execArgv).concat(args);
      proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
    }
    if (!proc.killed) {
      const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
      signals.forEach((signal) => {
        process2.on(signal, () => {
          if (proc.killed === false && proc.exitCode === null) {
            proc.kill(signal);
          }
        });
      });
    }
    const exitCallback = this._exitCallback;
    proc.on("close", (code) => {
      code = code ?? 1;
      if (!exitCallback) {
        process2.exit(code);
      } else {
        exitCallback(
          new CommanderError(
            code,
            "commander.executeSubCommandAsync",
            "(close)"
          )
        );
      }
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        this._checkForMissingExecutable(
          executableFile,
          executableDir,
          subcommand._name
        );
      } else if (err.code === "EACCES") {
        throw new Error(`'${executableFile}' not executable`);
      }
      if (!exitCallback) {
        process2.exit(1);
      } else {
        const wrappedError = new CommanderError(
          1,
          "commander.executeSubCommandAsync",
          "(error)"
        );
        wrappedError.nestedError = err;
        exitCallback(wrappedError);
      }
    });
    this.runningCommand = proc;
  }
  /**
   * @private
   */
  _dispatchSubcommand(commandName, operands, unknown) {
    const subCommand = this._findCommand(commandName);
    if (!subCommand) this.help({ error: true });
    subCommand._prepareForParse();
    let promiseChain;
    promiseChain = this._chainOrCallSubCommandHook(
      promiseChain,
      subCommand,
      "preSubcommand"
    );
    promiseChain = this._chainOrCall(promiseChain, () => {
      if (subCommand._executableHandler) {
        this._executeSubCommand(subCommand, operands.concat(unknown));
      } else {
        return subCommand._parseCommand(operands, unknown);
      }
    });
    return promiseChain;
  }
  /**
   * Invoke help directly if possible, or dispatch if necessary.
   * e.g. help foo
   *
   * @private
   */
  _dispatchHelpCommand(subcommandName) {
    if (!subcommandName) {
      this.help();
    }
    const subCommand = this._findCommand(subcommandName);
    if (subCommand && !subCommand._executableHandler) {
      subCommand.help();
    }
    return this._dispatchSubcommand(
      subcommandName,
      [],
      [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
    );
  }
  /**
   * Check this.args against expected this.registeredArguments.
   *
   * @private
   */
  _checkNumberOfArguments() {
    this.registeredArguments.forEach((arg, i) => {
      if (arg.required && this.args[i] == null) {
        this.missingArgument(arg.name());
      }
    });
    if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
      return;
    }
    if (this.args.length > this.registeredArguments.length) {
      this._excessArguments(this.args);
    }
  }
  /**
   * Process this.args using this.registeredArguments and save as this.processedArgs!
   *
   * @private
   */
  _processArguments() {
    const myParseArg = (argument, value, previous) => {
      let parsedValue = value;
      if (value !== null && argument.parseArg) {
        const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
        parsedValue = this._callParseArg(
          argument,
          value,
          previous,
          invalidValueMessage
        );
      }
      return parsedValue;
    };
    this._checkNumberOfArguments();
    const processedArgs = [];
    this.registeredArguments.forEach((declaredArg, index) => {
      let value = declaredArg.defaultValue;
      if (declaredArg.variadic) {
        if (index < this.args.length) {
          value = this.args.slice(index);
          if (declaredArg.parseArg) {
            value = value.reduce((processed, v) => {
              return myParseArg(declaredArg, v, processed);
            }, declaredArg.defaultValue);
          }
        } else if (value === void 0) {
          value = [];
        }
      } else if (index < this.args.length) {
        value = this.args[index];
        if (declaredArg.parseArg) {
          value = myParseArg(declaredArg, value, declaredArg.defaultValue);
        }
      }
      processedArgs[index] = value;
    });
    this.processedArgs = processedArgs;
  }
  /**
   * Once we have a promise we chain, but call synchronously until then.
   *
   * @param {(Promise|undefined)} promise
   * @param {Function} fn
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCall(promise, fn) {
    if (promise?.then && typeof promise.then === "function") {
      return promise.then(() => fn());
    }
    return fn();
  }
  /**
   *
   * @param {(Promise|undefined)} promise
   * @param {string} event
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCallHooks(promise, event) {
    let result = promise;
    const hooks = [];
    this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
      hookedCommand._lifeCycleHooks[event].forEach((callback) => {
        hooks.push({ hookedCommand, callback });
      });
    });
    if (event === "postAction") {
      hooks.reverse();
    }
    hooks.forEach((hookDetail) => {
      result = this._chainOrCall(result, () => {
        return hookDetail.callback(hookDetail.hookedCommand, this);
      });
    });
    return result;
  }
  /**
   *
   * @param {(Promise|undefined)} promise
   * @param {Command} subCommand
   * @param {string} event
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCallSubCommandHook(promise, subCommand, event) {
    let result = promise;
    if (this._lifeCycleHooks[event] !== void 0) {
      this._lifeCycleHooks[event].forEach((hook) => {
        result = this._chainOrCall(result, () => {
          return hook(this, subCommand);
        });
      });
    }
    return result;
  }
  /**
   * Process arguments in context of this command.
   * Returns action result, in case it is a promise.
   *
   * @private
   */
  _parseCommand(operands, unknown) {
    const parsed = this.parseOptions(unknown);
    this._parseOptionsEnv();
    this._parseOptionsImplied();
    operands = operands.concat(parsed.operands);
    unknown = parsed.unknown;
    this.args = operands.concat(unknown);
    if (operands && this._findCommand(operands[0])) {
      return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
    }
    if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
      return this._dispatchHelpCommand(operands[1]);
    }
    if (this._defaultCommandName) {
      this._outputHelpIfRequested(unknown);
      return this._dispatchSubcommand(
        this._defaultCommandName,
        operands,
        unknown
      );
    }
    if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
      this.help({ error: true });
    }
    this._outputHelpIfRequested(parsed.unknown);
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();
    const checkForUnknownOptions = () => {
      if (parsed.unknown.length > 0) {
        this.unknownOption(parsed.unknown[0]);
      }
    };
    const commandEvent = `command:${this.name()}`;
    if (this._actionHandler) {
      checkForUnknownOptions();
      this._processArguments();
      let promiseChain;
      promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
      promiseChain = this._chainOrCall(
        promiseChain,
        () => this._actionHandler(this.processedArgs)
      );
      if (this.parent) {
        promiseChain = this._chainOrCall(promiseChain, () => {
          this.parent.emit(commandEvent, operands, unknown);
        });
      }
      promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
      return promiseChain;
    }
    if (this.parent?.listenerCount(commandEvent)) {
      checkForUnknownOptions();
      this._processArguments();
      this.parent.emit(commandEvent, operands, unknown);
    } else if (operands.length) {
      if (this._findCommand("*")) {
        return this._dispatchSubcommand("*", operands, unknown);
      }
      if (this.listenerCount("command:*")) {
        this.emit("command:*", operands, unknown);
      } else if (this.commands.length) {
        this.unknownCommand();
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    } else if (this.commands.length) {
      checkForUnknownOptions();
      this.help({ error: true });
    } else {
      checkForUnknownOptions();
      this._processArguments();
    }
  }
  /**
   * Find matching command.
   *
   * @private
   * @return {Command | undefined}
   */
  _findCommand(name) {
    if (!name) return void 0;
    return this.commands.find(
      (cmd) => cmd._name === name || cmd._aliases.includes(name)
    );
  }
  /**
   * Return an option matching `arg` if any.
   *
   * @param {string} arg
   * @return {Option}
   * @package
   */
  _findOption(arg) {
    return this.options.find((option) => option.is(arg));
  }
  /**
   * Display an error message if a mandatory option does not have a value.
   * Called after checking for help flags in leaf subcommand.
   *
   * @private
   */
  _checkForMissingMandatoryOptions() {
    this._getCommandAndAncestors().forEach((cmd) => {
      cmd.options.forEach((anOption) => {
        if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
          cmd.missingMandatoryOptionValue(anOption);
        }
      });
    });
  }
  /**
   * Display an error message if conflicting options are used together in this.
   *
   * @private
   */
  _checkForConflictingLocalOptions() {
    const definedNonDefaultOptions = this.options.filter((option) => {
      const optionKey = option.attributeName();
      if (this.getOptionValue(optionKey) === void 0) {
        return false;
      }
      return this.getOptionValueSource(optionKey) !== "default";
    });
    const optionsWithConflicting = definedNonDefaultOptions.filter(
      (option) => option.conflictsWith.length > 0
    );
    optionsWithConflicting.forEach((option) => {
      const conflictingAndDefined = definedNonDefaultOptions.find(
        (defined) => option.conflictsWith.includes(defined.attributeName())
      );
      if (conflictingAndDefined) {
        this._conflictingOption(option, conflictingAndDefined);
      }
    });
  }
  /**
   * Display an error message if conflicting options are used together.
   * Called after checking for help flags in leaf subcommand.
   *
   * @private
   */
  _checkForConflictingOptions() {
    this._getCommandAndAncestors().forEach((cmd) => {
      cmd._checkForConflictingLocalOptions();
    });
  }
  /**
   * Parse options from `argv` removing known options,
   * and return argv split into operands and unknown arguments.
   *
   * Side effects: modifies command by storing options. Does not reset state if called again.
   *
   * Examples:
   *
   *     argv => operands, unknown
   *     --known kkk op => [op], []
   *     op --known kkk => [op], []
   *     sub --unknown uuu op => [sub], [--unknown uuu op]
   *     sub -- --unknown uuu op => [sub --unknown uuu op], []
   *
   * @param {string[]} args
   * @return {{operands: string[], unknown: string[]}}
   */
  parseOptions(args) {
    const operands = [];
    const unknown = [];
    let dest = operands;
    function maybeOption(arg) {
      return arg.length > 1 && arg[0] === "-";
    }
    const negativeNumberArg = (arg) => {
      if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
      return !this._getCommandAndAncestors().some(
        (cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short))
      );
    };
    let activeVariadicOption = null;
    let activeGroup = null;
    let i = 0;
    while (i < args.length || activeGroup) {
      const arg = activeGroup ?? args[i++];
      activeGroup = null;
      if (arg === "--") {
        if (dest === unknown) dest.push(arg);
        dest.push(...args.slice(i));
        break;
      }
      if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
        this.emit(`option:${activeVariadicOption.name()}`, arg);
        continue;
      }
      activeVariadicOption = null;
      if (maybeOption(arg)) {
        const option = this._findOption(arg);
        if (option) {
          if (option.required) {
            const value = args[i++];
            if (value === void 0) this.optionMissingArgument(option);
            this.emit(`option:${option.name()}`, value);
          } else if (option.optional) {
            let value = null;
            if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
              value = args[i++];
            }
            this.emit(`option:${option.name()}`, value);
          } else {
            this.emit(`option:${option.name()}`);
          }
          activeVariadicOption = option.variadic ? option : null;
          continue;
        }
      }
      if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
        const option = this._findOption(`-${arg[1]}`);
        if (option) {
          if (option.required || option.optional && this._combineFlagAndOptionalValue) {
            this.emit(`option:${option.name()}`, arg.slice(2));
          } else {
            this.emit(`option:${option.name()}`);
            activeGroup = `-${arg.slice(2)}`;
          }
          continue;
        }
      }
      if (/^--[^=]+=/.test(arg)) {
        const index = arg.indexOf("=");
        const option = this._findOption(arg.slice(0, index));
        if (option && (option.required || option.optional)) {
          this.emit(`option:${option.name()}`, arg.slice(index + 1));
          continue;
        }
      }
      if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
        dest = unknown;
      }
      if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
        if (this._findCommand(arg)) {
          operands.push(arg);
          unknown.push(...args.slice(i));
          break;
        } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
          operands.push(arg, ...args.slice(i));
          break;
        } else if (this._defaultCommandName) {
          unknown.push(arg, ...args.slice(i));
          break;
        }
      }
      if (this._passThroughOptions) {
        dest.push(arg, ...args.slice(i));
        break;
      }
      dest.push(arg);
    }
    return { operands, unknown };
  }
  /**
   * Return an object containing local option values as key-value pairs.
   *
   * @return {object}
   */
  opts() {
    if (this._storeOptionsAsProperties) {
      const result = {};
      const len = this.options.length;
      for (let i = 0; i < len; i++) {
        const key = this.options[i].attributeName();
        result[key] = key === this._versionOptionName ? this._version : this[key];
      }
      return result;
    }
    return this._optionValues;
  }
  /**
   * Return an object containing merged local and global option values as key-value pairs.
   *
   * @return {object}
   */
  optsWithGlobals() {
    return this._getCommandAndAncestors().reduce(
      (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
      {}
    );
  }
  /**
   * Display error message and exit (or call exitOverride).
   *
   * @param {string} message
   * @param {object} [errorOptions]
   * @param {string} [errorOptions.code] - an id string representing the error
   * @param {number} [errorOptions.exitCode] - used with process.exit
   */
  error(message, errorOptions) {
    this._outputConfiguration.outputError(
      `${message}
`,
      this._outputConfiguration.writeErr
    );
    if (typeof this._showHelpAfterError === "string") {
      this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
    } else if (this._showHelpAfterError) {
      this._outputConfiguration.writeErr("\n");
      this.outputHelp({ error: true });
    }
    const config = errorOptions || {};
    const exitCode = config.exitCode || 1;
    const code = config.code || "commander.error";
    this._exit(exitCode, code, message);
  }
  /**
   * Apply any option related environment variables, if option does
   * not have a value from cli or client code.
   *
   * @private
   */
  _parseOptionsEnv() {
    this.options.forEach((option) => {
      if (option.envVar && option.envVar in process2.env) {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
          this.getOptionValueSource(optionKey)
        )) {
          if (option.required || option.optional) {
            this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
          } else {
            this.emit(`optionEnv:${option.name()}`);
          }
        }
      }
    });
  }
  /**
   * Apply any implied option values, if option is undefined or default value.
   *
   * @private
   */
  _parseOptionsImplied() {
    const dualHelper = new DualOptions(this.options);
    const hasCustomOptionValue = (optionKey) => {
      return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
    };
    this.options.filter(
      (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
        this.getOptionValue(option.attributeName()),
        option
      )
    ).forEach((option) => {
      Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
        this.setOptionValueWithSource(
          impliedKey,
          option.implied[impliedKey],
          "implied"
        );
      });
    });
  }
  /**
   * Argument `name` is missing.
   *
   * @param {string} name
   * @private
   */
  missingArgument(name) {
    const message = `error: missing required argument '${name}'`;
    this.error(message, { code: "commander.missingArgument" });
  }
  /**
   * `Option` is missing an argument.
   *
   * @param {Option} option
   * @private
   */
  optionMissingArgument(option) {
    const message = `error: option '${option.flags}' argument missing`;
    this.error(message, { code: "commander.optionMissingArgument" });
  }
  /**
   * `Option` does not have a value, and is a mandatory option.
   *
   * @param {Option} option
   * @private
   */
  missingMandatoryOptionValue(option) {
    const message = `error: required option '${option.flags}' not specified`;
    this.error(message, { code: "commander.missingMandatoryOptionValue" });
  }
  /**
   * `Option` conflicts with another option.
   *
   * @param {Option} option
   * @param {Option} conflictingOption
   * @private
   */
  _conflictingOption(option, conflictingOption) {
    const findBestOptionFromValue = (option2) => {
      const optionKey = option2.attributeName();
      const optionValue = this.getOptionValue(optionKey);
      const negativeOption = this.options.find(
        (target) => target.negate && optionKey === target.attributeName()
      );
      const positiveOption = this.options.find(
        (target) => !target.negate && optionKey === target.attributeName()
      );
      if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
        return negativeOption;
      }
      return positiveOption || option2;
    };
    const getErrorMessage = (option2) => {
      const bestOption = findBestOptionFromValue(option2);
      const optionKey = bestOption.attributeName();
      const source = this.getOptionValueSource(optionKey);
      if (source === "env") {
        return `environment variable '${bestOption.envVar}'`;
      }
      return `option '${bestOption.flags}'`;
    };
    const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
    this.error(message, { code: "commander.conflictingOption" });
  }
  /**
   * Unknown option `flag`.
   *
   * @param {string} flag
   * @private
   */
  unknownOption(flag) {
    if (this._allowUnknownOption) return;
    let suggestion = "";
    if (flag.startsWith("--") && this._showSuggestionAfterError) {
      let candidateFlags = [];
      let command = this;
      do {
        const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
        candidateFlags = candidateFlags.concat(moreFlags);
        command = command.parent;
      } while (command && !command._enablePositionalOptions);
      suggestion = suggestSimilar(flag, candidateFlags);
    }
    const message = `error: unknown option '${flag}'${suggestion}`;
    this.error(message, { code: "commander.unknownOption" });
  }
  /**
   * Excess arguments, more than expected.
   *
   * @param {string[]} receivedArgs
   * @private
   */
  _excessArguments(receivedArgs) {
    if (this._allowExcessArguments) return;
    const expected = this.registeredArguments.length;
    const s = expected === 1 ? "" : "s";
    const received = receivedArgs.length;
    const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
    const details = receivedArgs.join(", ");
    const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${received}: ${details}.`;
    this.error(message, { code: "commander.excessArguments" });
  }
  /**
   * Unknown command.
   *
   * @private
   */
  unknownCommand() {
    const unknownName = this.args[0];
    let suggestion = "";
    if (this._showSuggestionAfterError) {
      const candidateNames = [];
      this.createHelp().visibleCommands(this).forEach((command) => {
        candidateNames.push(command.name());
        if (command.alias()) candidateNames.push(command.alias());
      });
      suggestion = suggestSimilar(unknownName, candidateNames);
    }
    const message = `error: unknown command '${unknownName}'${suggestion}`;
    this.error(message, { code: "commander.unknownCommand" });
  }
  /**
   * Get or set the program version.
   *
   * This method auto-registers the "-V, --version" option which will print the version number.
   *
   * You can optionally supply the flags and description to override the defaults.
   *
   * @param {string} [str]
   * @param {string} [flags]
   * @param {string} [description]
   * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
   */
  version(str, flags, description) {
    if (str === void 0) return this._version;
    this._version = str;
    flags = flags || "-V, --version";
    description = description || "output the version number";
    const versionOption = this.createOption(flags, description);
    this._versionOptionName = versionOption.attributeName();
    this._registerOption(versionOption);
    this.on("option:" + versionOption.name(), () => {
      this._outputConfiguration.writeOut(`${str}
`);
      this._exit(0, "commander.version", str);
    });
    return this;
  }
  /**
   * Set the description.
   *
   * @param {string} [str]
   * @param {object} [argsDescription]
   * @return {(string|Command)}
   */
  description(str, argsDescription) {
    if (str === void 0 && argsDescription === void 0)
      return this._description;
    this._description = str;
    if (argsDescription) {
      this._argsDescription = argsDescription;
    }
    return this;
  }
  /**
   * Set the summary. Used when listed as subcommand of parent.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  summary(str) {
    if (str === void 0) return this._summary;
    this._summary = str;
    return this;
  }
  /**
   * Set an alias for the command.
   *
   * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
   *
   * @param {string} [alias]
   * @return {(string|Command)}
   */
  alias(alias) {
    if (alias === void 0) return this._aliases[0];
    let command = this;
    if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
      command = this.commands[this.commands.length - 1];
    }
    if (alias === command._name)
      throw new Error("Command alias can't be the same as its name");
    const matchingCommand = this.parent?._findCommand(alias);
    if (matchingCommand) {
      const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
      throw new Error(
        `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
      );
    }
    command._aliases.push(alias);
    return this;
  }
  /**
   * Set aliases for the command.
   *
   * Only the first alias is shown in the auto-generated help.
   *
   * @param {string[]} [aliases]
   * @return {(string[]|Command)}
   */
  aliases(aliases) {
    if (aliases === void 0) return this._aliases;
    aliases.forEach((alias) => this.alias(alias));
    return this;
  }
  /**
   * Set / get the command usage `str`.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  usage(str) {
    if (str === void 0) {
      if (this._usage) return this._usage;
      const args = this.registeredArguments.map((arg) => {
        return humanReadableArgName(arg);
      });
      return [].concat(
        this.options.length || this._helpOption !== null ? "[options]" : [],
        this.commands.length ? "[command]" : [],
        this.registeredArguments.length ? args : []
      ).join(" ");
    }
    this._usage = str;
    return this;
  }
  /**
   * Get or set the name of the command.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  name(str) {
    if (str === void 0) return this._name;
    this._name = str;
    return this;
  }
  /**
   * Set/get the help group heading for this subcommand in parent command's help.
   *
   * @param {string} [heading]
   * @return {Command | string}
   */
  helpGroup(heading) {
    if (heading === void 0) return this._helpGroupHeading ?? "";
    this._helpGroupHeading = heading;
    return this;
  }
  /**
   * Set/get the default help group heading for subcommands added to this command.
   * (This does not override a group set directly on the subcommand using .helpGroup().)
   *
   * @example
   * program.commandsGroup('Development Commands:);
   * program.command('watch')...
   * program.command('lint')...
   * ...
   *
   * @param {string} [heading]
   * @returns {Command | string}
   */
  commandsGroup(heading) {
    if (heading === void 0) return this._defaultCommandGroup ?? "";
    this._defaultCommandGroup = heading;
    return this;
  }
  /**
   * Set/get the default help group heading for options added to this command.
   * (This does not override a group set directly on the option using .helpGroup().)
   *
   * @example
   * program
   *   .optionsGroup('Development Options:')
   *   .option('-d, --debug', 'output extra debugging')
   *   .option('-p, --profile', 'output profiling information')
   *
   * @param {string} [heading]
   * @returns {Command | string}
   */
  optionsGroup(heading) {
    if (heading === void 0) return this._defaultOptionGroup ?? "";
    this._defaultOptionGroup = heading;
    return this;
  }
  /**
   * @param {Option} option
   * @private
   */
  _initOptionGroup(option) {
    if (this._defaultOptionGroup && !option.helpGroupHeading)
      option.helpGroup(this._defaultOptionGroup);
  }
  /**
   * @param {Command} cmd
   * @private
   */
  _initCommandGroup(cmd) {
    if (this._defaultCommandGroup && !cmd.helpGroup())
      cmd.helpGroup(this._defaultCommandGroup);
  }
  /**
   * Set the name of the command from script filename, such as process.argv[1],
   * or import.meta.filename.
   *
   * (Used internally and public although not documented in README.)
   *
   * @example
   * program.nameFromFilename(import.meta.filename);
   *
   * @param {string} filename
   * @return {Command}
   */
  nameFromFilename(filename) {
    this._name = path.basename(filename, path.extname(filename));
    return this;
  }
  /**
   * Get or set the directory for searching for executable subcommands of this command.
   *
   * @example
   * program.executableDir(import.meta.dirname);
   * // or
   * program.executableDir('subcommands');
   *
   * @param {string} [path]
   * @return {(string|null|Command)}
   */
  executableDir(path10) {
    if (path10 === void 0) return this._executableDir;
    this._executableDir = path10;
    return this;
  }
  /**
   * Return program help documentation.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
   * @return {string}
   */
  helpInformation(contextOptions) {
    const helper = this.createHelp();
    const context = this._getOutputContext(contextOptions);
    helper.prepareContext({
      error: context.error,
      helpWidth: context.helpWidth,
      outputHasColors: context.hasColors
    });
    const text = helper.formatHelp(this, helper);
    if (context.hasColors) return text;
    return this._outputConfiguration.stripColor(text);
  }
  /**
   * @typedef HelpContext
   * @type {object}
   * @property {boolean} error
   * @property {number} helpWidth
   * @property {boolean} hasColors
   * @property {function} write - includes stripColor if needed
   *
   * @returns {HelpContext}
   * @private
   */
  _getOutputContext(contextOptions) {
    contextOptions = contextOptions || {};
    const error = !!contextOptions.error;
    let baseWrite;
    let hasColors;
    let helpWidth;
    if (error) {
      baseWrite = (str) => this._outputConfiguration.writeErr(str);
      hasColors = this._outputConfiguration.getErrHasColors();
      helpWidth = this._outputConfiguration.getErrHelpWidth();
    } else {
      baseWrite = (str) => this._outputConfiguration.writeOut(str);
      hasColors = this._outputConfiguration.getOutHasColors();
      helpWidth = this._outputConfiguration.getOutHelpWidth();
    }
    const write = (str) => {
      if (!hasColors) str = this._outputConfiguration.stripColor(str);
      return baseWrite(str);
    };
    return { error, write, hasColors, helpWidth };
  }
  /**
   * Output help information for this command.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */
  outputHelp(contextOptions) {
    let deprecatedCallback;
    if (typeof contextOptions === "function") {
      deprecatedCallback = contextOptions;
      contextOptions = void 0;
    }
    const outputContext = this._getOutputContext(contextOptions);
    const eventContext = {
      error: outputContext.error,
      write: outputContext.write,
      command: this
    };
    this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
    this.emit("beforeHelp", eventContext);
    let helpInformation = this.helpInformation({ error: outputContext.error });
    if (deprecatedCallback) {
      helpInformation = deprecatedCallback(helpInformation);
      if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
        throw new Error("outputHelp callback must return a string or a Buffer");
      }
    }
    outputContext.write(helpInformation);
    if (this._getHelpOption()?.long) {
      this.emit(this._getHelpOption().long);
    }
    this.emit("afterHelp", eventContext);
    this._getCommandAndAncestors().forEach(
      (command) => command.emit("afterAllHelp", eventContext)
    );
  }
  /**
   * You can pass in flags and a description to customise the built-in help option.
   * Pass in false to disable the built-in help option.
   *
   * @example
   * program.helpOption('-?, --help' 'show help'); // customise
   * program.helpOption(false); // disable
   *
   * @param {(string | boolean)} flags
   * @param {string} [description]
   * @return {Command} `this` command for chaining
   */
  helpOption(flags, description) {
    if (typeof flags === "boolean") {
      if (flags) {
        if (this._helpOption === null) this._helpOption = void 0;
        if (this._defaultOptionGroup) {
          this._initOptionGroup(this._getHelpOption());
        }
      } else {
        this._helpOption = null;
      }
      return this;
    }
    this._helpOption = this.createOption(
      flags ?? "-h, --help",
      description ?? "display help for command"
    );
    if (flags || description) this._initOptionGroup(this._helpOption);
    return this;
  }
  /**
   * Lazy create help option.
   * Returns null if has been disabled with .helpOption(false).
   *
   * @returns {(Option | null)} the help option
   * @package
   */
  _getHelpOption() {
    if (this._helpOption === void 0) {
      this.helpOption(void 0, void 0);
    }
    return this._helpOption;
  }
  /**
   * Supply your own option to use for the built-in help option.
   * This is an alternative to using helpOption() to customise the flags and description etc.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addHelpOption(option) {
    this._helpOption = option;
    this._initOptionGroup(option);
    return this;
  }
  /**
   * Output help information and exit.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */
  help(contextOptions) {
    this.outputHelp(contextOptions);
    let exitCode = Number(process2.exitCode ?? 0);
    if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
      exitCode = 1;
    }
    this._exit(exitCode, "commander.help", "(outputHelp)");
  }
  /**
   * // Do a little typing to coordinate emit and listener for the help text events.
   * @typedef HelpTextEventContext
   * @type {object}
   * @property {boolean} error
   * @property {Command} command
   * @property {function} write
   */
  /**
   * Add additional text to be displayed with the built-in help.
   *
   * Position is 'before' or 'after' to affect just this command,
   * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
   *
   * @param {string} position - before or after built-in help
   * @param {(string | Function)} text - string to add, or a function returning a string
   * @return {Command} `this` command for chaining
   */
  addHelpText(position, text) {
    const allowedValues = ["beforeAll", "before", "after", "afterAll"];
    if (!allowedValues.includes(position)) {
      throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    const helpEvent = `${position}Help`;
    this.on(helpEvent, (context) => {
      let helpStr;
      if (typeof text === "function") {
        helpStr = text({ error: context.error, command: context.command });
      } else {
        helpStr = text;
      }
      if (helpStr) {
        context.write(`${helpStr}
`);
      }
    });
    return this;
  }
  /**
   * Output help information if help flags specified
   *
   * @param {Array} args - array of options to search for help flags
   * @private
   */
  _outputHelpIfRequested(args) {
    const helpOption = this._getHelpOption();
    const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
    if (helpRequested) {
      this.outputHelp();
      this._exit(0, "commander.helpDisplayed", "(outputHelp)");
    }
  }
};
function incrementNodeInspectorPort(args) {
  return args.map((arg) => {
    if (!arg.startsWith("--inspect")) {
      return arg;
    }
    let debugOption;
    let debugHost = "127.0.0.1";
    let debugPort = "9229";
    let match;
    if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
      debugOption = match[1];
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
      debugOption = match[1];
      if (/^\d+$/.test(match[3])) {
        debugPort = match[3];
      } else {
        debugHost = match[3];
      }
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
      debugOption = match[1];
      debugHost = match[3];
      debugPort = match[4];
    }
    if (debugOption && debugPort !== "0") {
      return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
    }
    return arg;
  });
}
function useColor() {
  if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
    return false;
  if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
    return true;
  return void 0;
}

// node_modules/commander/index.js
var program = new Command();

// src/core/version.ts
var VERSION = "0.0.0";

// src/core/errors.ts
var ForkpointError = class extends Error {
  code;
  runId;
  seq;
  callsite;
  hint;
  constructor(code, message, options = {}) {
    super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.runId = options.runId;
    this.seq = options.seq;
    this.callsite = options.callsite;
    this.hint = options.hint;
  }
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...this.runId === void 0 ? {} : { runId: this.runId },
      ...this.seq === void 0 ? {} : { seq: this.seq },
      ...this.callsite === void 0 ? {} : { callsite: this.callsite },
      ...this.hint === void 0 ? {} : { hint: this.hint }
    };
  }
};
var NonSerializableError = class extends ForkpointError {
  path;
  constructor(path10, detail, options = {}) {
    super(
      "NON_SERIALIZABLE",
      `Value at ${path10} cannot be stored faithfully: ${detail}`,
      { hint: "Convert it to plain JSON types before recording; Forkpoint does not guess.", ...options }
    );
    this.path = path10;
  }
  toJSON() {
    return { ...super.toJSON(), path: this.path };
  }
};
var FixtureMissError = class extends ForkpointError {
  expectedKey;
  actualKey;
  nearest;
  diffPaths;
  constructor(expectedKey, options = {}) {
    super("FIXTURE_MISS", `No fixture recorded for request ${expectedKey.slice(0, 12)}\u2026`, {
      hint: "Re-record the run, or check for code that bypasses the wrappers.",
      ...options
    });
    this.expectedKey = expectedKey;
    this.actualKey = options.actualKey;
    this.nearest = options.nearest ?? [];
    this.diffPaths = options.diffPaths ?? [];
  }
  toJSON() {
    return {
      ...super.toJSON(),
      expectedKey: this.expectedKey,
      ...this.actualKey === void 0 ? {} : { actualKey: this.actualKey },
      nearest: this.nearest,
      diffPaths: this.diffPaths
    };
  }
};
var CassetteCorruptError = class extends ForkpointError {
  constructor(file, detail, options = {}) {
    super("CASSETTE_CORRUPT", `Cannot read cassette ${file}: ${detail}`, {
      hint: "Restore from a backup or re-record. Forkpoint will not modify a corrupt cassette.",
      ...options
    });
  }
};
var MigrationError = class extends ForkpointError {
  constructor(file, detail, options = {}) {
    super("MIGRATION_FAILED", `Cannot migrate cassette ${file}: ${detail}`, {
      hint: "The pre-migration file is kept at <cassette>.bak.",
      ...options
    });
  }
};
var RunExistsError = class extends ForkpointError {
  constructor(runId) {
    super("RUN_EXISTS", `Run ${runId} already exists.`, {
      hint: "Use a new run id, or pass the existing run to show/replay.",
      runId
    });
  }
};
var RunNotFoundError = class extends ForkpointError {
  constructor(runId, store) {
    super("RUN_NOT_FOUND", `Run ${runId} was not found in ${store}.`, {
      hint: "Run `forkpoint ls` to see available runs.",
      runId
    });
  }
};
var UsageError = class extends ForkpointError {
  constructor(message) {
    super("USAGE", message, { hint: "Run `forkpoint --help` for usage." });
  }
};
function isForkpointError(error) {
  return error instanceof ForkpointError;
}

// src/store/cassette.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync2 } from "node:fs";

// src/core/clock.ts
var dateNow = Date.now.bind(Date);
var hrtime = process.hrtime.bigint.bind(process.hrtime);
var performanceNow = performance.now.bind(performance);
function realNow() {
  return dateNow();
}

// src/core/serialize.ts
function toJsonText(value, path10 = "$") {
  try {
    const text = JSON.stringify(value);
    if (text === void 0) throw new NonSerializableError(path10, "value serialized to undefined");
    return text;
  } catch (error) {
    if (error instanceof NonSerializableError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new NonSerializableError(path10, detail, { cause: error });
  }
}
function parseJsonText(text) {
  return JSON.parse(text);
}

// src/store/db.ts
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path2 from "node:path";
import { DatabaseSync } from "node:sqlite";

// src/store/schema.ts
var SCHEMA_VERSION = 1;
var SCHEMA_V1 = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  parent_run_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  command TEXT,
  cwd TEXT,
  git_sha TEXT,
  node_version TEXT,
  platform TEXT,
  config_json TEXT,
  env_json TEXT,
  seed INTEGER,
  metrics_json TEXT
);

CREATE TABLE events (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  span_id TEXT,
  parent_span_id TEXT,
  ts REAL NOT NULL,
  duration_ms REAL,
  callsite TEXT,
  request_hash TEXT,
  response_hash TEXT,
  payload BLOB,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE fixtures (
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  fixture_key TEXT NOT NULL,
  occurrence INTEGER NOT NULL,
  callsite TEXT,
  request_json TEXT,
  response_blob BLOB,
  meta_json TEXT,
  PRIMARY KEY (run_id, kind, fixture_key, occurrence)
);

CREATE TABLE blobs (
  hash TEXT PRIMARY KEY,
  content BLOB NOT NULL,
  encoding TEXT NOT NULL
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  base_run_id TEXT NOT NULL,
  variant_run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  format TEXT NOT NULL,
  content TEXT NOT NULL,
  summary_json TEXT
);

CREATE INDEX idx_events_run_seq ON events(run_id, seq);
CREATE INDEX idx_fixtures_lookup ON fixtures(run_id, kind, fixture_key);
CREATE INDEX idx_runs_created_at ON runs(created_at);
`;
var REQUIRED_TABLES = ["meta", "runs", "events", "fixtures", "blobs", "reports"];
var MIGRATIONS = {};

// src/store/db.ts
var CASSETTE_FILE = "cassette.sqlite";
function cassettePath(store) {
  return path2.join(path2.resolve(store), CASSETTE_FILE);
}
function openDatabase(store) {
  const file = cassettePath(store);
  mkdirSync(path2.dirname(file), { recursive: true });
  let db;
  try {
    db = new DatabaseSync(file);
  } catch (error) {
    throw wrapCorruption(file, error);
  }
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA journal_mode = DELETE");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA foreign_keys = ON");
    ensureSchema(db, file);
    return db;
  } catch (error) {
    safeClose(db);
    throw wrapCorruption(file, error);
  }
}
function ensureSchema(db, file) {
  let tables = listTables(db, file);
  if (tables.length === 0) {
    createCurrentSchema(db, file);
    return;
  }
  if (!tables.includes("meta")) {
    throw new CassetteCorruptError(file, "the meta table is missing");
  }
  let version;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    if (row === void 0) {
      throw new CassetteCorruptError(file, "meta.schema_version is missing");
    }
    version = Number(row.value);
    if (!Number.isInteger(version) || version < 0) {
      throw new CassetteCorruptError(file, `invalid schema_version ${String(row.value)}`);
    }
  } catch (error) {
    if (error instanceof CassetteCorruptError) throw error;
    throw wrapCorruption(file, error);
  }
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      file,
      `cassette version ${version} is newer than this build (${SCHEMA_VERSION}); upgrade Forkpoint`
    );
  }
  if (version < SCHEMA_VERSION) {
    migrate(db, file, version);
    tables = listTables(db, file);
  }
  const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
  if (missing.length > 0) {
    throw new CassetteCorruptError(file, `missing tables: ${missing.join(", ")}`);
  }
}
function listTables(db, file) {
  try {
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => String(row.name));
  } catch (error) {
    throw wrapCorruption(file, error);
  }
}
function createCurrentSchema(db, file) {
  try {
    db.exec("BEGIN");
    db.exec(SCHEMA_V1);
    db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
    }
    throw wrapCorruption(file, error);
  }
}
function migrate(db, file, from) {
  const backup = `${file}.bak`;
  try {
    if (existsSync(file)) copyFileSync(file, backup);
  } catch (error) {
    throw new MigrationError(file, `cannot write backup ${backup}`, { cause: error });
  }
  try {
    db.exec("BEGIN");
    for (let version = from + 1; version <= SCHEMA_VERSION; version += 1) {
      const migration = MIGRATIONS[version];
      if (migration === void 0) {
        throw new Error(`no migration path from version ${version - 1} to ${version}`);
      }
      db.exec(migration);
    }
    db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(String(SCHEMA_VERSION));
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
    }
    throw new MigrationError(file, error instanceof Error ? error.message : String(error), {
      cause: error
    });
  }
}
function safeClose(db) {
  try {
    db.close();
  } catch {
  }
}
function wrapCorruption(file, error) {
  if (error instanceof CassetteCorruptError || error instanceof MigrationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/not a database|malformed|corrupt|invalid page|disk image/i.test(message)) {
    return new CassetteCorruptError(file, message, { cause: error });
  }
  return error instanceof Error ? error : new Error(message, { cause: error });
}

// src/store/cassette.ts
var EVENT_FLUSH_THRESHOLD = 50;
var Cassette = class {
  constructor(store) {
    this.store = store;
    this.file = cassettePath(store);
    this.db = openDatabase(store);
    this.insertEvent = this.db.prepare(`
      INSERT INTO events (
        run_id, seq, type, span_id, parent_span_id, ts, duration_ms,
        callsite, request_hash, response_hash, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.insertEventNextSeq = this.db.prepare(`
      INSERT INTO events (
        run_id, seq, type, span_id, parent_span_id, ts, duration_ms,
        callsite, request_hash, response_hash, payload
      )
      SELECT ?, COALESCE(MAX(seq), -1) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM events WHERE run_id = ?
    `);
    this.insertFixture = this.db.prepare(`
      INSERT INTO fixtures (
        run_id, kind, fixture_key, occurrence, callsite, request_json, response_blob, meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  store;
  file;
  db;
  pending = [];
  seqByRun = /* @__PURE__ */ new Map();
  insertEvent;
  insertEventNextSeq;
  insertFixture;
  closed = false;
  createRun(run) {
    try {
      this.db.prepare(`
          INSERT INTO runs (
            id, name, created_at, parent_run_id, mode, status, command, cwd,
            git_sha, node_version, platform, config_json, env_json, seed, metrics_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        run.id,
        run.name,
        run.createdAt ?? new Date(realNow()).toISOString(),
        run.parentRunId ?? null,
        run.mode,
        run.status,
        run.command ?? null,
        run.cwd ?? null,
        run.gitSha ?? null,
        run.nodeVersion ?? null,
        run.platform ?? null,
        run.config === void 0 ? null : toJsonText(run.config, "$.config"),
        run.env === void 0 ? null : toJsonText(run.env, "$.env"),
        run.seed ?? null,
        run.metrics === void 0 ? null : toJsonText(run.metrics, "$.metrics")
      );
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        throw new RunExistsError(run.id);
      }
      throw error;
    }
  }
  getRun(runId) {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
    return row === void 0 ? void 0 : mapRun(row);
  }
  listRuns(limit = 20) {
    return this.db.prepare("SELECT * FROM runs ORDER BY created_at DESC, id DESC LIMIT ?").all(limit).map(mapRun);
  }
  updateRunStatus(runId, status, metrics) {
    this.db.prepare("UPDATE runs SET status = ?, metrics_json = COALESCE(?, metrics_json) WHERE id = ?").run(status, metrics === void 0 ? null : toJsonText(metrics, "$.metrics"), runId);
  }
  updateRunEnvironment(runId, env) {
    this.db.prepare("UPDATE runs SET env_json = ? WHERE id = ?").run(toJsonText(env, "$.env"), runId);
  }
  updateRunConfig(runId, config) {
    this.db.prepare("UPDATE runs SET config_json = ? WHERE id = ?").run(toJsonText(config, "$.config"), runId);
  }
  appendEvent(runId, event) {
    const record = {
      ...event,
      payload: parseJsonText(toJsonText(event.payload, "$.payload")),
      runId,
      seq: this.nextSeq(runId),
      ts: event.ts ?? realNow()
    };
    this.pending.push(record);
    if (this.pending.length >= EVENT_FLUSH_THRESHOLD) this.flush();
  }
  appendEventNow(runId, event) {
    this.insertEventNextSeq.run(
      runId,
      event.type,
      event.spanId ?? null,
      event.parentSpanId ?? null,
      event.ts ?? realNow(),
      event.durationMs ?? null,
      event.callsite ?? null,
      event.requestHash ?? null,
      event.responseHash ?? null,
      event.payload === void 0 ? null : Buffer.from(toJsonText(event.payload, "$.payload"), "utf8"),
      runId
    );
  }
  flush() {
    if (this.pending.length === 0 || this.closed) return;
    this.db.exec("BEGIN");
    try {
      for (const event of this.pending) {
        this.insertEvent.run(
          event.runId,
          event.seq,
          event.type,
          event.spanId ?? null,
          event.parentSpanId ?? null,
          event.ts,
          event.durationMs ?? null,
          event.callsite ?? null,
          event.requestHash ?? null,
          event.responseHash ?? null,
          event.payload === void 0 ? null : Buffer.from(toJsonText(event.payload, "$.payload"), "utf8")
        );
      }
      this.db.exec("COMMIT");
      this.pending.length = 0;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
      }
      throw error;
    }
  }
  hasEventType(runId, type) {
    const row = this.db.prepare("SELECT 1 AS found FROM events WHERE run_id = ? AND type = ? LIMIT 1").get(runId, type);
    return row !== void 0;
  }
  countEvents(runId) {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM events WHERE run_id = ?").get(runId);
    return Number(row?.count ?? 0);
  }
  getEvents(runId, limit) {
    const sql = `SELECT * FROM events WHERE run_id = ? ORDER BY seq ASC${limit === void 0 ? "" : " LIMIT ?"}`;
    const statement = this.db.prepare(sql);
    const rows = limit === void 0 ? statement.all(runId) : statement.all(runId, limit);
    return rows.map(mapEvent);
  }
  countFixtures(runId) {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM fixtures WHERE run_id = ?").get(runId);
    return Number(row?.count ?? 0);
  }
  getEventsByType(runId, type) {
    return this.db.prepare("SELECT * FROM events WHERE run_id = ? AND type = ? ORDER BY seq ASC").all(runId, type).map(mapEvent);
  }
  putFixture(runId, fixture) {
    try {
      this.insertFixture.run(
        runId,
        fixture.kind,
        fixture.fixtureKey,
        fixture.occurrence,
        fixture.callsite ?? null,
        fixture.requestJson ?? null,
        fixture.response === void 0 ? null : Buffer.from(toJsonText(fixture.response, "$.response"), "utf8"),
        fixture.meta === void 0 ? null : toJsonText(fixture.meta, "$.meta")
      );
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        throw new ForkpointError(
          "FIXTURE_DUPLICATE",
          `Fixture ${fixture.kind}/${fixture.fixtureKey.slice(0, 12)}\u2026 occurrence ${fixture.occurrence} already exists.`,
          { hint: "Occurrence allocation is broken; this is a Forkpoint bug." }
        );
      }
      throw error;
    }
  }
  getFixture(runId, kind, fixtureKey, occurrence) {
    const row = this.db.prepare(
      "SELECT * FROM fixtures WHERE run_id = ? AND kind = ? AND fixture_key = ? AND occurrence = ?"
    ).get(runId, kind, fixtureKey, occurrence);
    return row === void 0 ? void 0 : mapFixture(row);
  }
  listFixtures(runId) {
    return this.db.prepare(
      "SELECT * FROM fixtures WHERE run_id = ? ORDER BY kind ASC, fixture_key ASC, occurrence ASC"
    ).all(runId).map(mapFixture);
  }
  putBlob(content, encoding = "utf8") {
    const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const hash = createBlobHash(buffer);
    this.db.prepare("INSERT OR IGNORE INTO blobs(hash, content, encoding) VALUES (?, ?, ?)").run(hash, buffer, encoding);
    return hash;
  }
  getBlob(hash) {
    const row = this.db.prepare("SELECT content FROM blobs WHERE hash = ?").get(hash);
    return row === void 0 ? void 0 : Buffer.from(row.content);
  }
  close() {
    if (this.closed) return;
    try {
      this.flush();
    } finally {
      this.closed = true;
      this.db.close();
    }
  }
  nextSeq(runId) {
    let next = this.seqByRun.get(runId);
    if (next === void 0) {
      const row = this.db.prepare("SELECT COALESCE(MAX(seq), -1) AS max_seq FROM events WHERE run_id = ?").get(runId);
      next = Number(row?.max_seq ?? -1) + 1;
    }
    this.seqByRun.set(runId, next + 1);
    return next;
  }
};
function openCassette(store) {
  return new Cassette(store);
}
function openExistingCassette(store) {
  return existsSync2(cassettePath(store)) ? new Cassette(store) : void 0;
}
function mapRun(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    ...row.parent_run_id === null ? {} : { parentRunId: String(row.parent_run_id) },
    mode: String(row.mode),
    status: String(row.status),
    ...row.command === null ? {} : { command: String(row.command) },
    ...row.cwd === null ? {} : { cwd: String(row.cwd) },
    ...row.git_sha === null ? {} : { gitSha: String(row.git_sha) },
    ...row.node_version === null ? {} : { nodeVersion: String(row.node_version) },
    ...row.platform === null ? {} : { platform: String(row.platform) },
    ...row.config_json === null ? {} : { configJson: String(row.config_json) },
    ...row.env_json === null ? {} : { envJson: String(row.env_json) },
    ...row.seed === null ? {} : { seed: Number(row.seed) },
    ...row.metrics_json === null ? {} : { metricsJson: String(row.metrics_json) }
  };
}
function mapFixture(row) {
  return {
    kind: String(row.kind),
    fixtureKey: String(row.fixture_key),
    occurrence: Number(row.occurrence),
    ...row.callsite === null ? {} : { callsite: String(row.callsite) },
    ...row.request_json === null ? {} : { requestJson: String(row.request_json) },
    ...row.response_blob === null ? {} : { response: parseJsonText(Buffer.from(row.response_blob).toString("utf8")) },
    ...row.meta_json === null ? {} : { meta: parseJsonText(String(row.meta_json)) }
  };
}
function mapEvent(row) {
  return {
    runId: String(row.run_id),
    seq: Number(row.seq),
    type: String(row.type),
    ts: Number(row.ts),
    ...row.span_id === null ? {} : { spanId: String(row.span_id) },
    ...row.parent_span_id === null ? {} : { parentSpanId: String(row.parent_span_id) },
    ...row.duration_ms === null ? {} : { durationMs: Number(row.duration_ms) },
    ...row.callsite === null ? {} : { callsite: String(row.callsite) },
    ...row.request_hash === null ? {} : { requestHash: String(row.request_hash) },
    ...row.response_hash === null ? {} : { responseHash: String(row.response_hash) },
    payload: row.payload === null ? null : parseJsonText(Buffer.from(row.payload).toString("utf8"))
  };
}
function createBlobHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// src/cli/output.ts
function printError(error, options = {}) {
  const exitCode = exitCodeFor(error);
  if (options.json === true) {
    const body = isForkpointError(error) ? { ok: false, error: error.toJSON() } : {
      ok: false,
      error: {
        code: "UNEXPECTED",
        message: error instanceof Error ? error.message : String(error)
      }
    };
    process.stderr.write(`${JSON.stringify(body)}
`);
  } else {
    if (isForkpointError(error)) {
      process.stderr.write(`forkpoint: ${error.code}: ${error.message}
`);
      if (error.callsite !== void 0) process.stderr.write(`  at ${error.callsite}
`);
      if (error instanceof FixtureMissError) {
        if (error.diffPaths.length > 0) {
          process.stderr.write(`  changed: ${error.diffPaths.join(", ")}
`);
        }
        for (const candidate of error.nearest) {
          const location = candidate.callsite === void 0 ? "" : ` at ${candidate.callsite}`;
          const detail = candidate.diffPaths.length === 0 ? "identical request" : candidate.diffPaths.join(", ");
          process.stderr.write(
            `  nearest: ${candidate.key.slice(0, 12)}\u2026${location} (${detail})
`
          );
        }
      }
      if (error.hint !== void 0) process.stderr.write(`  hint: ${error.hint}
`);
    } else {
      process.stderr.write(`forkpoint: ${error instanceof Error ? error.message : String(error)}
`);
    }
  }
  if (options.debug === true && error instanceof Error && error.stack !== void 0) {
    process.stderr.write(`${error.stack}
`);
  }
  ;
  return exitCode;
}
function exitCodeFor(error) {
  if (error instanceof ForkpointError) {
    return error.code === "USAGE" ? 2 : 1;
  }
  return 1;
}
function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function formatRunTable(runs) {
  if (runs.length === 0) return "No runs.";
  const header = ["RUN ID", "CREATED", "STATUS", "NAME"];
  const rows = runs.map((run) => [
    run.id,
    run.createdAt,
    run.status,
    truncate(run.name, 48)
  ]);
  const widths = header.map(
    (title, index) => Math.max(title.length, ...rows.map((row) => row[index].length))
  );
  return [header, ...rows].map((row) => row.map((cell2, index) => cell2.padEnd(widths[index])).join("  ").trimEnd()).join("\n");
}
function truncate(value, length) {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1))}\u2026`;
}

// src/cli/record.ts
import path4 from "node:path";

// src/core/env.ts
import { existsSync as existsSync3, readFileSync } from "node:fs";
import path3 from "node:path";
import { spawnSync } from "node:child_process";

// src/core/fingerprint.ts
import { createHash as createHash2 } from "node:crypto";
var MAX_DEPTH = 1e3;
function canonicalize(value) {
  return encode(value, "$", 0, /* @__PURE__ */ new WeakSet());
}
function fingerprintValue(value) {
  return sha256(canonicalize(value));
}
function sha256(input) {
  return createHash2("sha256").update(input).digest("hex");
}
function encode(value, path10, depth, seen) {
  if (depth > MAX_DEPTH) {
    throw new NonSerializableError(path10, `nesting exceeds ${MAX_DEPTH} levels`);
  }
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return encodeNumber(value, path10);
    case "undefined":
      if (path10 === "$") throw new NonSerializableError(path10, "undefined is not a JSON value");
      return "null";
    case "bigint":
      throw new NonSerializableError(path10, "BigInt is not a JSON value");
    case "function":
    case "symbol":
      throw new NonSerializableError(path10, `${typeof value} is not a JSON value`);
    case "object":
      return encodeObject(value, path10, depth, seen);
    default:
      throw new NonSerializableError(path10, `unsupported type ${typeof value}`);
  }
}
function encodeNumber(value, path10) {
  if (!Number.isFinite(value)) {
    throw new NonSerializableError(path10, `${String(value)} is not a finite number`);
  }
  if (Object.is(value, -0)) return "0";
  return JSON.stringify(value);
}
function encodeObject(value, path10, depth, seen) {
  if (seen.has(value)) {
    throw new NonSerializableError(path10, "circular reference");
  }
  const symbols = Object.getOwnPropertySymbols(value).filter(
    (symbol) => Object.prototype.propertyIsEnumerable.call(value, symbol)
  );
  if (symbols.length > 0) {
    throw new NonSerializableError(path10, "object has enumerable symbol keys");
  }
  if (Array.isArray(value)) {
    seen.add(value);
    const parts2 = [];
    for (let index = 0; index < value.length; index += 1) {
      parts2.push(encode(value[index], `${path10}[${index}]`, depth + 1, seen));
    }
    seen.delete(value);
    return `[${parts2.join(",")}]`;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    const name = prototype.constructor?.name ?? "unknown";
    throw new NonSerializableError(path10, `object of type ${name} is not a plain JSON object`);
  }
  seen.add(value);
  const record = value;
  const keys = Object.keys(record).sort();
  const parts = [];
  for (const key of keys) {
    const child = record[key];
    if (child === void 0) continue;
    parts.push(`${JSON.stringify(key)}:${encode(child, childPath(path10, key), depth + 1, seen)}`);
  }
  seen.delete(value);
  return `{${parts.join(",")}}`;
}
function childPath(parent, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

// src/core/env.ts
var DEFAULT_ENV_WHITELIST = ["NODE_ENV", "CI", "TZ", "LANG"];
var SENSITIVE_ENV = /(_KEY|_TOKEN|_SECRET|_PASSWORD)$/i;
var LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"];
function captureEnvironment(whitelist = DEFAULT_ENV_WHITELIST, env = process.env, cwd = process.cwd()) {
  const captured = {};
  for (const name of whitelist) {
    if (SENSITIVE_ENV.test(name)) continue;
    const value = env[name];
    if (value !== void 0) captured[name] = value;
  }
  const lockfile = LOCKFILES.map((name) => path3.join(cwd, name)).find((file) => existsSync3(file));
  if (lockfile === void 0) return { env: captured };
  return {
    env: captured,
    lockfile: path3.basename(lockfile),
    lockfileHash: sha256(readFileSync(lockfile))
  };
}
function readGitSha(cwd) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    timeout: 2e3,
    windowsHide: true
  });
  if (result.status !== 0) return void 0;
  const sha = result.stdout.trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : void 0;
}
function collectRunMetadata(command, cwd = process.cwd()) {
  const environment = captureEnvironment(DEFAULT_ENV_WHITELIST, process.env, cwd);
  return {
    ...command === void 0 ? {} : { command },
    cwd,
    gitSha: readGitSha(cwd),
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    ...environment.lockfileHash === void 0 ? {} : { lockfileHash: environment.lockfileHash },
    ...environment.lockfile === void 0 ? {} : { lockfile: environment.lockfile }
  };
}
function formatCommand(command, args) {
  return [command, ...args].map(quoteArg).join(" ");
}
function quoteArg(value) {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

// src/core/ulid.ts
import { randomBytes } from "node:crypto";
var ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
function createRunId(now = realNow()) {
  return `r_${encodeTime(now)}${encodeRandom()}`;
}
function encodeTime(now) {
  let remaining = Math.max(0, Math.trunc(now));
  let out = "";
  for (let index = 0; index < 10; index += 1) {
    out = ALPHABET[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}
function encodeRandom() {
  const bytes = randomBytes(16);
  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte & 31];
  }
  return out;
}

// src/cli/child.ts
var import_cross_spawn = __toESM(require_cross_spawn(), 1);
function spawnChild(spec) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const child = (0, import_cross_spawn.default)(spec.command, spec.args, {
      stdio: spec.quiet === true ? "ignore" : "inherit",
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORKPOINT_MODE: spec.mode,
        FORKPOINT_RUN_ID: spec.runId,
        FORKPOINT_STORE: spec.store,
        FORKPOINT_COMMAND: spec.commandText,
        ...spec.baselineRunId === void 0 ? {} : { FORKPOINT_BASELINE_RUN_ID: spec.baselineRunId },
        ...spec.extraEnv
      }
    });
    child.once("error", (error) => {
      settle({ code: null, signal: null, error });
    });
    child.once("exit", (code, signal) => {
      settle({ code, signal });
    });
  });
}
function finalizeChildRun(options) {
  const cassette = openExistingCassette(options.store);
  if (cassette === void 0) {
    printError(new Error(`cassette disappeared from ${options.store}`), options);
    return {
      runId: options.runId,
      status: "failed",
      childExitCode: options.outcome.error === void 0 ? options.outcome.code ?? 1 : 2
    };
  }
  try {
    const run = cassette.getRun(options.runId);
    if (run === void 0) {
      printError(new Error(`run row ${options.runId} disappeared`), options);
      return {
        runId: options.runId,
        status: "failed",
        childExitCode: options.outcome.error === void 0 ? options.outcome.code ?? 1 : 2
      };
    }
    if (run.status === "recording" || run.status === options.finalStatus) {
      const failed = options.outcome.error !== void 0 || options.outcome.signal !== null || options.outcome.code !== 0;
      const hasStart = cassette.hasEventType(options.runId, "run.start");
      const hasEnd = cassette.hasEventType(options.runId, "run.end");
      if (!hasStart) {
        process.stderr.write(`${options.missingStartMessage}
`);
      }
      if (failed) {
        if (hasStart && !hasEnd) {
          cassette.appendEvent(options.runId, {
            type: "run.end",
            payload: {
              status: "failed",
              error: options.outcome.error?.message ?? (options.outcome.signal === null ? `child exited with code ${String(options.outcome.code)} before completing the run` : `child terminated by ${options.outcome.signal}`)
            }
          });
        }
        cassette.flush();
        cassette.updateRunStatus(options.runId, "failed");
      } else if (!hasStart || !hasEnd) {
        process.stderr.write(`${options.incompleteMessage}
`);
        cassette.flush();
        cassette.updateRunStatus(options.runId, "failed");
      } else {
        cassette.flush();
        const current = cassette.getRun(options.runId);
        if (current?.status === "recording") {
          cassette.updateRunStatus(options.runId, options.finalStatus);
        }
      }
    }
    const finalRun = cassette.getRun(options.runId);
    return {
      runId: options.runId,
      status: finalRun?.status ?? "failed",
      childExitCode: options.outcome.error === void 0 ? options.outcome.code ?? 1 : 2
    };
  } finally {
    cassette.close();
  }
}

// src/cli/record.ts
async function recordCommand(options) {
  const store = path4.resolve(options.store);
  const commandText = formatCommand(options.command, options.args);
  const runId = createRunId();
  const metadata = collectRunMetadata(commandText);
  const cassette = openCassette(store);
  try {
    cassette.createRun({
      id: runId,
      name: options.name,
      mode: "recorded",
      status: "recording",
      command: commandText,
      cwd: metadata.cwd,
      ...metadata.gitSha === void 0 ? {} : { gitSha: metadata.gitSha },
      nodeVersion: metadata.nodeVersion,
      platform: metadata.platform,
      config: { argv: [options.command, ...options.args] }
    });
  } finally {
    cassette.close();
  }
  const outcome = await spawnChild({
    command: options.command,
    args: options.args,
    store,
    mode: "record",
    runId,
    commandText
  });
  const finalized = finalizeChildRun({
    runId,
    store,
    outcome,
    finalStatus: "recorded",
    json: options.json,
    debug: options.debug,
    missingStartMessage: "forkpoint: the child process never started a run. Did it call fp.run()?",
    incompleteMessage: "forkpoint: the child exited without a complete run; no run.end was recorded."
  });
  if (options.json) {
    printJson({ ok: finalized.status === "recorded", ...finalized });
  } else {
    if (finalized.status === "recorded") {
      process.stdout.write(`Recorded run ${runId}
`);
    } else {
      process.stdout.write(`Recording failed; partial cassette kept for run ${runId}
`);
    }
  }
  if (outcome.error !== void 0) return 2;
  if (outcome.code !== 0) return outcome.code ?? 1;
  return finalized.status === "recorded" ? 0 : 1;
}
function parseRecordArguments(args) {
  if (args.includes("--help") || args.includes("-h")) return "help";
  const separator = args.indexOf("--");
  const optionArgs = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const parsed = { command };
  for (let index = 0; index < optionArgs.length; index += 1) {
    const argument = optionArgs[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--verbose") {
      continue;
    }
    if (argument === "--name" || argument === "--store") {
      const value = optionArgs[index + 1];
      if (value === void 0) throw new UsageError(`${argument} requires a value.`);
      if (argument === "--name") parsed.name = value;
      else parsed.store = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--name=")) {
      parsed.name = argument.slice("--name=".length);
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    throw new UsageError(`Unknown record option: ${argument}`);
  }
  return parsed;
}
function toRecordOptions(parsed, storeFromOption) {
  if (parsed.name === void 0 || parsed.name.trim() === "") {
    throw new UsageError("record requires --name <name>.");
  }
  if (parsed.command.length === 0) {
    throw new UsageError("record requires a command after --.");
  }
  const command = parsed.command[0];
  return {
    name: parsed.name,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true,
    command,
    args: parsed.command.slice(1)
  };
}
function recordHelp() {
  return [
    "Usage: forkpoint record --name <name> [--store <dir>] [--json] -- <command...>",
    "",
    "Re-execute an agent command and record its LLM and tool boundaries.",
    "",
    "Options:",
    "  --name <name>    Run name shown by `forkpoint ls` and `show`",
    "  --store <dir>    Cassette directory (default: .forkpoint)",
    "  --json           Print the final result as JSON",
    "  --debug          Print stack traces on failure",
    "",
    "Everything after -- is passed to the child process unchanged."
  ].join("\n");
}

// src/cli/replay.ts
import path5 from "node:path";
async function executeReplay(options) {
  const store = path5.resolve(options.store);
  const baseline = readBaseline(store, options.runId);
  const resolved = resolveCommand(baseline, options.command);
  const commandText = formatCommand(resolved.command, resolved.args);
  const variantId = createRunId();
  const metadata = collectRunMetadata(commandText);
  const cassette = openCassette(store);
  try {
    cassette.createRun({
      id: variantId,
      name: baseline.name,
      parentRunId: baseline.id,
      mode: "replayed",
      status: "recording",
      command: commandText,
      cwd: metadata.cwd,
      ...metadata.gitSha === void 0 ? {} : { gitSha: metadata.gitSha },
      nodeVersion: metadata.nodeVersion,
      platform: metadata.platform,
      config: { replayedFrom: baseline.id, argv: [resolved.command, ...resolved.args] }
    });
  } finally {
    cassette.close();
  }
  const baselineModel = readBaselineModel(store, baseline.id);
  const extraEnv = {};
  if (baselineModel !== void 0) extraEnv.FORKPOINT_BASELINE_MODEL = baselineModel;
  if (options.failOnEnvChange) extraEnv.FORKPOINT_FAIL_ON_ENV_CHANGE = "1";
  const outcome = await spawnChild({
    command: resolved.command,
    args: resolved.args,
    store,
    mode: "replay",
    runId: variantId,
    baselineRunId: baseline.id,
    commandText,
    quiet: options.quiet === true,
    ...Object.keys(extraEnv).length === 0 ? {} : { extraEnv }
  });
  const finalized = finalizeChildRun({
    runId: variantId,
    store,
    outcome,
    finalStatus: "replayed",
    json: options.json,
    debug: options.debug,
    missingStartMessage: "forkpoint: the child process never started a replay. Did it call fp.run()?",
    incompleteMessage: "forkpoint: the child exited without a complete replay; no run.end was recorded."
  });
  return {
    runId: variantId,
    baselineRunId: baseline.id,
    status: finalized.status,
    childExitCode: finalized.childExitCode
  };
}
async function replayCommand(options) {
  const result = await executeReplay(options);
  if (options.json) {
    printJson({ ok: result.status === "replayed", ...result });
  } else if (result.status === "replayed") {
    process.stdout.write(`Replayed run ${result.runId} from ${result.baselineRunId}
`);
  } else {
    process.stdout.write(`Replay failed; partial cassette kept for run ${result.runId}
`);
  }
  if (result.childExitCode === 2) return 2;
  if (result.childExitCode !== 0) return result.childExitCode;
  return result.status === "replayed" ? 0 : 1;
}
function readBaseline(store, runId) {
  const cassette = openExistingCassette(store);
  if (cassette === void 0) throw new RunNotFoundError(runId, store);
  try {
    const run = cassette.getRun(runId);
    if (run === void 0) throw new RunNotFoundError(runId, store);
    if (run.mode === "observed") {
      throw new UsageError(
        `Run ${run.id} is an observed Claude Code trace. Observed runs record tool calls only and cannot be replayed, verified, or forked; compare them with \`forkpoint diff\`.`
      );
    }
    return run;
  } finally {
    cassette.close();
  }
}
function readBaselineModel(store, runId) {
  const cassette = openExistingCassette(store);
  if (cassette === void 0) return void 0;
  try {
    for (const event of cassette.getEventsByType(runId, "llm.request")) {
      if (typeof event.payload !== "object" || event.payload === null) continue;
      const model = event.payload.model;
      if (typeof model === "string") return model;
    }
    return void 0;
  } finally {
    cassette.close();
  }
}
function resolveCommand(baseline, override, commandName = "replay") {
  if (override.length > 0) {
    return { command: override[0], args: override.slice(1) };
  }
  const argv2 = readConfigArgv(baseline.configJson);
  if (argv2 !== void 0) {
    return { command: argv2[0], args: argv2.slice(1) };
  }
  throw new UsageError(
    `Run ${baseline.id} has no recorded command; pass it after --: forkpoint ${commandName} ${baseline.id} -- <command...>`
  );
}
function readConfigArgv(configJson) {
  if (configJson === void 0) return void 0;
  try {
    const config = JSON.parse(configJson);
    if (typeof config !== "object" || config === null) return void 0;
    const argv2 = config.argv;
    if (!Array.isArray(argv2) || argv2.length === 0) return void 0;
    if (!argv2.every((value) => typeof value === "string")) return void 0;
    return argv2;
  } catch {
    return void 0;
  }
}
function parseReplayArguments(args) {
  if (args.includes("--help") || args.includes("-h")) return "help";
  if (args.includes("--allow-live")) {
    throw new UsageError("--allow-live is not available in v0.1; strict replay never calls a model.");
  }
  const separator = args.indexOf("--");
  const optionArgs = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const parsed = { command };
  for (let index = 0; index < optionArgs.length; index += 1) {
    const argument = optionArgs[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (argument === "--verbose") {
      continue;
    }
    if (argument === "--fail-on-env-change") {
      parsed.failOnEnvChange = true;
      continue;
    }
    if (argument === "--store") {
      const value = optionArgs[index + 1];
      if (value === void 0) throw new UsageError("--store requires a value.");
      parsed.store = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown replay option: ${argument}`);
    }
    if (parsed.runId !== void 0) {
      throw new UsageError(`Unexpected argument: ${argument}`);
    }
    parsed.runId = argument;
  }
  return parsed;
}
function toReplayOptions(parsed, storeFromOption) {
  if (parsed.runId === void 0 || parsed.runId.trim() === "") {
    throw new UsageError("replay requires a run id.");
  }
  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true,
    failOnEnvChange: parsed.failOnEnvChange === true,
    command: parsed.command
  };
}
function replayHelp() {
  return [
    "Usage: forkpoint replay <run_id> [--store <dir>] [--json] [--strict] [--fail-on-env-change] -- [command...]",
    "",
    "Re-execute the recorded command against the cassette. No model or tool is called live.",
    "",
    "Options:",
    "  --store <dir>    Cassette directory (default: .forkpoint)",
    "  --json           Print the final result as JSON",
    "  --strict         Strict replay (the only mode in v0.1)",
    "  --fail-on-env-change  Fail instead of warning when the whitelisted env changed",
    "  --debug          Print stack traces on failure",
    "",
    "The original command is reused when it was recorded; pass a command after -- to override it."
  ].join("\n");
}

// src/core/event-hash.ts
function digestEvent(event) {
  return fingerprintValue({
    seq: event.seq,
    type: event.type,
    spanId: event.spanId ?? null,
    parentSpanId: event.parentSpanId ?? null,
    callsite: event.callsite ?? null,
    requestHash: event.requestHash ?? null,
    responseHash: event.responseHash ?? null,
    payload: event.payload
  });
}
function hashEvents(events) {
  return {
    hash: fingerprintValue(events.map(digestEvent)),
    eventCount: events.length
  };
}
function firstEventDifference(expected, actual) {
  const count = Math.max(expected.length, actual.length);
  for (let index = 0; index < count; index += 1) {
    const left = expected[index];
    const right = actual[index];
    if (left === void 0) {
      return {
        seq: right.seq,
        reason: "missing",
        actual: { type: right.type, hash: digestEvent(right) }
      };
    }
    if (right === void 0) {
      return {
        seq: left.seq,
        reason: "missing",
        expected: { type: left.type, hash: digestEvent(left) }
      };
    }
    const expectedHash = digestEvent(left);
    const actualHash = digestEvent(right);
    if (left.type !== right.type) {
      return {
        seq: left.seq,
        reason: "type",
        expected: { type: left.type, hash: expectedHash },
        actual: { type: right.type, hash: actualHash }
      };
    }
    if (expectedHash !== actualHash) {
      return {
        seq: left.seq,
        reason: "content",
        expected: { type: left.type, hash: expectedHash },
        actual: { type: right.type, hash: actualHash }
      };
    }
  }
  return void 0;
}

// src/cli/verify.ts
var REPLAY_COUNT = 2;
var CONSUMED_TYPES = /* @__PURE__ */ new Set(["llm.response", "llm.error", "tool.result", "tool.error"]);
async function verifyCommand(options) {
  const executions = [];
  for (let index = 0; index < REPLAY_COUNT; index += 1) {
    const execution = await executeReplay({
      runId: options.runId,
      store: options.store,
      json: false,
      debug: options.debug,
      failOnEnvChange: false,
      command: [],
      quiet: true
    });
    executions.push(execution);
    if (execution.status !== "replayed") {
      return reportReplayFailure(options, executions, execution);
    }
  }
  const first = executions[0];
  const second = executions[1];
  const baselineData = readRun(options.store, first.baselineRunId, true);
  const firstData = readRun(options.store, first.runId, false);
  const secondData = readRun(options.store, second.runId, false);
  if (firstData === void 0 || secondData === void 0) {
    throw new Error("The cassette disappeared while verifying; re-run the command.");
  }
  const firstReport = hashEvents(firstData.events);
  const secondReport = hashEvents(secondData.events);
  const difference = firstEventDifference(firstData.events, secondData.events) ?? (firstReport.hash === secondReport.hash ? void 0 : {
    seq: Math.min(firstData.events.length, secondData.events.length),
    reason: "content",
    expected: { type: "sequence", hash: firstReport.hash },
    actual: { type: "sequence", hash: secondReport.hash }
  });
  const ok = difference === void 0;
  const unconsumed = Math.max(
    0,
    (baselineData?.fixtureCount ?? 0) - countConsumed(firstData.events)
  );
  if (options.json) {
    printJson({
      ok,
      baselineRunId: first.baselineRunId,
      deterministic: ok,
      eventCount: firstReport.eventCount,
      hash: firstReport.hash,
      replays: executions.map((execution) => ({
        runId: execution.runId,
        status: execution.status
      })),
      ...difference === void 0 ? {} : { difference },
      ...unconsumed === 0 ? {} : { unconsumedFixtures: unconsumed }
    });
  } else if (ok) {
    process.stdout.write(
      `Deterministic: ${firstReport.eventCount} events across ${REPLAY_COUNT} replays (${firstReport.hash.slice(0, 12)})
`
    );
    if (unconsumed > 0) {
      process.stdout.write(`Warning: ${unconsumed} baseline fixture(s) were not consumed.
`);
    }
  } else {
    process.stdout.write(
      `Not deterministic: first difference at seq ${difference.seq} (${difference.reason})
`
    );
    process.stdout.write(`  expected: ${describeSide(difference.expected)}
`);
    process.stdout.write(`  actual:   ${describeSide(difference.actual)}
`);
  }
  return ok ? 0 : 1;
}
function reportReplayFailure(options, executions, failed) {
  if (options.json) {
    printJson({
      ok: false,
      baselineRunId: failed.baselineRunId,
      deterministic: false,
      replays: executions.map((execution) => ({
        runId: execution.runId,
        status: execution.status
      })),
      error: `replay ${String(executions.length)} ended with status ${failed.status}`
    });
  } else {
    process.stdout.write(
      `Verify failed: replay ${String(executions.length)} ended with status ${failed.status} (run ${failed.runId}).
`
    );
    process.stdout.write(`Inspect it with: forkpoint show ${failed.runId} --events
`);
  }
  return 1;
}
function readRun(store, runId, includeFixtures) {
  const cassette = openExistingCassette(store);
  if (cassette === void 0) return void 0;
  try {
    return {
      events: cassette.getEvents(runId),
      ...includeFixtures ? { fixtureCount: cassette.countFixtures(runId) } : {}
    };
  } finally {
    cassette.close();
  }
}
function countConsumed(events) {
  return events.filter((event) => CONSUMED_TYPES.has(event.type)).length;
}
function describeSide(side) {
  if (side === void 0) return "(none)";
  return `${side.type} ${side.hash.slice(0, 12)}`;
}
function parseVerifyArguments(args) {
  if (args.includes("--help") || args.includes("-h")) return "help";
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--store") {
      const value = args[index + 1];
      if (value === void 0) throw new UsageError("--store requires a value.");
      parsed.store = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown verify option: ${argument}`);
    }
    if (parsed.runId !== void 0) {
      throw new UsageError(`Unexpected argument: ${argument}`);
    }
    parsed.runId = argument;
  }
  return parsed;
}
function toVerifyOptions(parsed, storeFromOption) {
  if (parsed.runId === void 0 || parsed.runId.trim() === "") {
    throw new UsageError("verify requires a run id.");
  }
  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true
  };
}
function verifyHelp() {
  return [
    "Usage: forkpoint verify <run_id> [--store <dir>] [--json] [--debug]",
    "",
    "Replay a recorded run twice in isolated variant runs and compare stable event hashes.",
    "Timestamps and durations are excluded. The command fails on the first differing event.",
    "",
    "Options:",
    "  --store <dir>    Cassette directory (default: .forkpoint)",
    "  --json           Print the report as JSON",
    "  --debug          Print stack traces on failure"
  ].join("\n");
}

// src/cli/diff.ts
import { writeFileSync } from "node:fs";
import path6 from "node:path";

// src/core/diff.ts
var CAVEATS = [
  "Steps are paired by callsite and per-callsite ordinal; concurrent in-flight calls are not supported.",
  "Only wrapped LLM and tool boundaries are compared; clock, RNG, and env are reported by verify.",
  "Cost is not estimated in v0.1; tokens and duration come from the cassette."
];
var OBSERVED_CAVEAT = "Observed Claude Code runs record tool calls only; they have no LLM steps and cannot be replayed, verified, or forked.";
function collectSteps(events) {
  const steps = [];
  const pending = /* @__PURE__ */ new Map();
  const ordinals = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event.type === "llm.request") {
      const payload = asRecord(event.payload);
      const request = payload.request;
      const callsite = event.callsite ?? "unknown";
      steps.push({
        kind: "llm",
        name: typeof payload.model === "string" ? payload.model : "llm",
        callsite,
        ordinal: nextOrdinal(ordinals, `llm|${callsite}`),
        seq: event.seq,
        requestHash: event.requestHash ?? fingerprintValue(request),
        request
      });
      pending.set("llm", steps.length - 1);
      continue;
    }
    if (event.type === "llm.response") {
      const index = pending.get("llm");
      if (index === void 0) continue;
      const step = steps[index];
      const payload = asRecord(event.payload);
      step.response = payload.response;
      step.responseHash = event.responseHash ?? fingerprintValue(payload.response);
      step.usage = asRecord(payload.usage);
      step.finishReason = typeof payload.finishReason === "string" ? payload.finishReason : void 0;
      step.durationMs = event.durationMs;
      pending.delete("llm");
      continue;
    }
    if (event.type === "llm.error") {
      const index = pending.get("llm");
      if (index === void 0) continue;
      steps[index].error = stepError(event.payload);
      pending.delete("llm");
      continue;
    }
    if (event.type === "tool.call") {
      const payload = asRecord(event.payload);
      const args = payload.args;
      const callsite = event.callsite ?? "unknown";
      const name = typeof payload.name === "string" ? payload.name : "tool";
      steps.push({
        kind: "tool",
        name,
        callsite,
        ordinal: nextOrdinal(ordinals, `tool|${name}|${callsite}`),
        seq: event.seq,
        requestHash: event.requestHash ?? fingerprintValue(args),
        request: args
      });
      pending.set("tool", steps.length - 1);
      continue;
    }
    if (event.type === "tool.result") {
      const index = pending.get("tool");
      if (index === void 0) continue;
      const step = steps[index];
      const payload = asRecord(event.payload);
      step.response = payload.result;
      step.responseHash = event.responseHash ?? fingerprintValue(payload.result);
      step.durationMs = event.durationMs;
      pending.delete("tool");
      continue;
    }
    if (event.type === "tool.error") {
      const index = pending.get("tool");
      if (index === void 0) continue;
      steps[index].error = stepError(event.payload, "errorName");
      pending.delete("tool");
    }
  }
  return steps;
}
function alignSteps(baseSteps, variantSteps) {
  const byKey = /* @__PURE__ */ new Map();
  for (const step of variantSteps) {
    const key = alignmentKey(step);
    const list = byKey.get(key);
    if (list === void 0) byKey.set(key, [step]);
    else list.push(step);
  }
  const alignments = [];
  for (const base of baseSteps) {
    const variant = byKey.get(alignmentKey(base))?.shift();
    alignments.push(comparePair(base, variant));
  }
  for (const remaining of byKey.values()) {
    for (const variant of remaining) {
      alignments.push({ index: 0, variant, status: "added_step" });
    }
  }
  alignments.forEach((alignment, index) => {
    alignment.index = index + 1;
  });
  return alignments;
}
function buildDiff(base, variant, baseEvents, variantEvents) {
  const baseSteps = collectSteps(baseEvents);
  const variantSteps = collectSteps(variantEvents);
  const alignments = alignSteps(baseSteps, variantSteps);
  for (const alignment of alignments) {
    if (alignment.status === "same") continue;
    alignment.category = categorize(alignment);
    alignment.severity = severityFor(alignment, base, variant);
  }
  const firstDivergence = alignments.find((alignment) => alignment.status !== "same");
  return {
    base,
    variant,
    alignmentStrategy: "callsite+ordinal",
    alignments,
    ...firstDivergence === void 0 ? {} : { firstDivergence },
    metrics: {
      base: summarizeRun(baseEvents, baseSteps),
      variant: summarizeRun(variantEvents, variantSteps)
    },
    caveats: base.mode === "observed" || variant.mode === "observed" ? [OBSERVED_CAVEAT, ...CAVEATS] : CAVEATS
  };
}
function comparePair(base, variant) {
  if (variant === void 0) {
    return { index: 0, base, status: "missing_step" };
  }
  if (base.error !== void 0 || variant.error !== void 0) {
    const same = base.error?.name === variant.error?.name && base.error?.message === variant.error?.message;
    return {
      index: 0,
      base,
      variant,
      status: same ? "same" : "error_changed"
    };
  }
  if (base.requestHash !== variant.requestHash) {
    return {
      index: 0,
      base,
      variant,
      status: "request_mismatch",
      fields: diffFields(base.request, variant.request)
    };
  }
  if (base.responseHash !== variant.responseHash) {
    return {
      index: 0,
      base,
      variant,
      status: "response_changed",
      fields: diffFields(base.response, variant.response)
    };
  }
  return { index: 0, base, variant, status: "same" };
}
function alignmentKey(step) {
  return step.kind === "tool" ? `tool|${step.name}|${step.callsite}|${step.ordinal}` : `llm|${step.callsite}|${step.ordinal}`;
}
var NONDETERMINISM_ERRORS = /* @__PURE__ */ new Set([
  "NondeterminismError",
  "RngMismatchError",
  "RngExhaustedError",
  "ClockReadLimitError"
]);
function categorize(alignment) {
  const errorName = alignment.variant?.error?.name ?? alignment.base?.error?.name;
  if (errorName === "FixtureMissError") return "fixture_miss";
  if (errorName !== void 0 && NONDETERMINISM_ERRORS.has(errorName)) {
    return "nondeterminism_leak";
  }
  switch (alignment.status) {
    case "request_mismatch":
      return "request_mismatch";
    case "response_changed":
      return "output_changed";
    case "error_changed":
      return alignment.base?.kind === "tool" || alignment.variant?.kind === "tool" ? "tool_exception" : "output_changed";
    default:
      return "unclassified";
  }
}
function severityFor(alignment, base, variant) {
  if (alignment.status === "response_changed") return "info";
  if (base.mode === "recorded" && variant.mode === "replayed") return "error";
  if (variant.mode === "forked") return "expected";
  return "info";
}
function summarizeRun(events, steps) {
  let totalTokens = 0;
  for (const step of steps) {
    const usage = step.usage;
    if (usage === void 0) continue;
    const total = usage.total_tokens;
    if (typeof total === "number") {
      totalTokens += total;
      continue;
    }
    const input = usage.prompt_tokens ?? usage.input_tokens;
    const output = usage.completion_tokens ?? usage.output_tokens;
    if (typeof input === "number") totalTokens += input;
    if (typeof output === "number") totalTokens += output;
  }
  const end = [...events].reverse().find((event) => event.type === "run.end");
  const lastLlm = [...steps].reverse().find((step) => step.kind === "llm" && step.response !== void 0);
  return {
    llmCalls: steps.filter((step) => step.kind === "llm").length,
    toolCalls: steps.filter((step) => step.kind === "tool").length,
    totalTokens,
    ...end?.durationMs === void 0 ? {} : { durationMs: end.durationMs },
    ...lastLlm === void 0 ? {} : withFinalAnswer(lastLlm.response)
  };
}
function withFinalAnswer(response) {
  const content = responseContent(response);
  return content === void 0 ? {} : { finalAnswer: content };
}
function responseContent(response) {
  const record = asRecord(response);
  const choices = Array.isArray(record.choices) ? record.choices : void 0;
  const first = choices === void 0 ? void 0 : asRecord(choices[0]);
  const message = first === void 0 ? void 0 : asRecord(first.message);
  return message !== void 0 && typeof message.content === "string" ? message.content : void 0;
}
function diffFields(base, variant, limit = 20) {
  const changes = [];
  walkDiff(base, variant, "$", changes, limit);
  return changes;
}
function walkDiff(base, variant, path10, changes, limit) {
  if (changes.length >= limit || Object.is(base, variant)) return;
  if (Array.isArray(base) && Array.isArray(variant)) {
    const count = Math.max(base.length, variant.length);
    for (let index = 0; index < count; index += 1) {
      walkDiff(base[index], variant[index], `${path10}[${index}]`, changes, limit);
      if (changes.length >= limit) return;
    }
    return;
  }
  const baseRecord = asRecordOrUndefined(base);
  const variantRecord = asRecordOrUndefined(variant);
  if (baseRecord !== void 0 && variantRecord !== void 0) {
    const keys = /* @__PURE__ */ new Set([...Object.keys(baseRecord), ...Object.keys(variantRecord)]);
    for (const key of [...keys].sort()) {
      walkDiff(baseRecord[key], variantRecord[key], `${path10}.${key}`, changes, limit);
      if (changes.length >= limit) return;
    }
    return;
  }
  changes.push({ path: path10, base, variant });
}
function nextOrdinal(ordinals, key) {
  const next = ordinals.get(key) ?? 0;
  ordinals.set(key, next + 1);
  return next;
}
function stepError(payload, nameField = "name") {
  const record = asRecord(payload);
  return {
    name: typeof record[nameField] === "string" ? record[nameField] : "Error",
    message: typeof record.message === "string" ? record.message : ""
  };
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function asRecordOrUndefined(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}

// src/cli/diff.ts
async function diffCommand(options) {
  if (options.baseId === options.variantId) {
    throw new UsageError("Cannot diff a run against itself.");
  }
  const store = path6.resolve(options.store);
  const cassette = openExistingCassette(store);
  if (cassette === void 0) throw new RunNotFoundError(options.baseId, store);
  let report;
  try {
    const base = cassette.getRun(options.baseId);
    if (base === void 0) throw new RunNotFoundError(options.baseId, store);
    const variant = cassette.getRun(options.variantId);
    if (variant === void 0) throw new RunNotFoundError(options.variantId, store);
    report = buildDiff(
      runInfo(base),
      runInfo(variant),
      cassette.getEvents(base.id),
      cassette.getEvents(variant.id)
    );
  } finally {
    cassette.close();
  }
  const output = options.format === "json" ? renderJson(report) : renderMarkdown(report);
  if (options.output === void 0) {
    process.stdout.write(output);
    return 0;
  }
  const target = path6.resolve(options.output);
  writeFileSync(target, output, "utf8");
  process.stdout.write(`Wrote ${target}
`);
  return 0;
}
function runInfo(run) {
  return { id: run.id, name: run.name, mode: run.mode, status: run.status };
}
function renderMarkdown(report) {
  const lines = [
    "# Forkpoint diff",
    "",
    `- Base: \`${report.base.id}\` (${report.base.mode}, ${report.base.status}) \u2014 ${report.base.name}`,
    `- Variant: \`${report.variant.id}\` (${report.variant.mode}, ${report.variant.status}) \u2014 ${report.variant.name}`,
    `- Alignment: ${report.alignmentStrategy}`,
    "",
    "## First divergence",
    ""
  ];
  const divergence = report.firstDivergence;
  if (divergence === void 0) {
    lines.push(`No behavioral divergence across ${report.alignments.length} aligned steps.`, "");
  } else {
    lines.push(
      `- Step: ${divergence.index} (${describeStep(divergence.base ?? divergence.variant)})`,
      `- Callsite: \`${divergence.base?.callsite ?? divergence.variant?.callsite ?? "unknown"}\``,
      `- Status: ${divergence.status}`,
      `- Category: ${divergence.category ?? "unclassified"}`,
      `- Severity: ${divergence.severity ?? "info"}`,
      ""
    );
    const fields = divergence.fields ?? [];
    if (fields.length > 0) {
      lines.push("| Field | Base | Variant |", "|---|---|---|");
      for (const field of fields.slice(0, 8)) {
        lines.push(`| \`${field.path}\` | ${cell(field.base)} | ${cell(field.variant)} |`);
      }
      if (fields.length > 8) lines.push("", `(${fields.length - 8} more field change(s) omitted.)`);
      lines.push("");
    }
  }
  const finalAnswer = finalAnswerChange(report);
  if (finalAnswer !== void 0) {
    lines.push("## Final output", "", "Base:", "", quote(finalAnswer.base), "", "Variant:", "", quote(finalAnswer.variant), "");
  }
  lines.push("## Timeline", "", "| # | Step | Callsite | Status |", "|---:|---|---|---|");
  for (const alignment of report.alignments) {
    const step = alignment.base ?? alignment.variant;
    lines.push(
      `| ${alignment.index} | ${describeStep(step)} | \`${escapeCell(step.callsite)}\` | ${alignment.status} |`
    );
  }
  lines.push("");
  lines.push(
    "## Metrics",
    "",
    "| Metric | Base | Variant |",
    "|---|---:|---:|",
    `| LLM calls | ${report.metrics.base.llmCalls} | ${report.metrics.variant.llmCalls} |`,
    `| Tool calls | ${report.metrics.base.toolCalls} | ${report.metrics.variant.toolCalls} |`,
    `| Tokens | ${report.metrics.base.totalTokens} | ${report.metrics.variant.totalTokens} |`,
    `| Duration | ${formatDuration(report.metrics.base.durationMs)} | ${formatDuration(report.metrics.variant.durationMs)} |`,
    "",
    "## Caveats",
    "",
    ...report.caveats.map((caveat) => `- ${caveat}`),
    ""
  );
  return lines.join("\n");
}
function renderJson(report) {
  const payload = {
    base: report.base,
    variant: report.variant,
    alignmentStrategy: report.alignmentStrategy,
    firstDivergence: report.firstDivergence === void 0 ? null : serializeAlignment(report.firstDivergence),
    steps: report.alignments.map(serializeAlignment),
    finalOutput: finalAnswerChange(report) ?? null,
    metrics: report.metrics,
    caveats: report.caveats
  };
  return `${JSON.stringify(payload, null, 2)}
`;
}
function serializeAlignment(alignment) {
  return {
    index: alignment.index,
    status: alignment.status,
    ...alignment.category === void 0 ? {} : { category: alignment.category },
    ...alignment.severity === void 0 ? {} : { severity: alignment.severity },
    ...alignment.base === void 0 ? {} : { base: serializeStep(alignment.base) },
    ...alignment.variant === void 0 ? {} : { variant: serializeStep(alignment.variant) },
    ...alignment.fields === void 0 ? {} : {
      fields: alignment.fields.map((field) => ({
        path: field.path,
        base: preview(field.base),
        variant: preview(field.variant)
      }))
    }
  };
}
function serializeStep(step) {
  return {
    kind: step.kind,
    name: step.name,
    callsite: step.callsite,
    seq: step.seq,
    requestHash: step.requestHash,
    ...step.responseHash === void 0 ? {} : { responseHash: step.responseHash },
    ...step.error === void 0 ? {} : { error: step.error },
    ...step.durationMs === void 0 ? {} : { durationMs: step.durationMs }
  };
}
function finalAnswerChange(report) {
  const base = report.metrics.base.finalAnswer;
  const variant = report.metrics.variant.finalAnswer;
  if (base === void 0 && variant === void 0) return void 0;
  if (base === variant) return void 0;
  return { base: base ?? "(none)", variant: variant ?? "(none)" };
}
function describeStep(step) {
  return step.kind === "llm" ? `llm ("${step.name}")` : `tool ("${step.name}")`;
}
function cell(value) {
  return `\`${escapeCell(preview(value))}\``;
}
function escapeCell(value) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
function preview(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 160 ? `${singleLine.slice(0, 159)}\u2026` : singleLine;
}
function quote(value) {
  const truncated = value.length > 600 ? `${value.slice(0, 599)}\u2026` : value;
  return truncated.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}
function formatDuration(value) {
  return value === void 0 ? "-" : `${value.toFixed(1)} ms`;
}
function parseDiffArguments(args) {
  if (args.includes("--help") || args.includes("-h")) return "help";
  const parsed = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      parsed.format = "json";
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--store") {
      parsed.store = valueOf(args, index, "--store");
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument === "-o" || argument === "--output") {
      parsed.output = valueOf(args, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--format") {
      parsed.format = parseFormat(valueOf(args, index, "--format"));
      index += 1;
      continue;
    }
    if (argument.startsWith("--format=")) {
      parsed.format = parseFormat(argument.slice("--format=".length));
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown diff option: ${argument}`);
    }
    positional.push(argument);
  }
  if (positional.length > 2) throw new UsageError(`Unexpected argument: ${positional[2]}`);
  [parsed.baseId, parsed.variantId] = positional;
  return parsed;
}
function toDiffOptions(parsed, storeFromOption) {
  if (parsed.baseId === void 0 || parsed.variantId === void 0) {
    throw new UsageError("diff requires two run ids: forkpoint diff <base> <variant>");
  }
  return {
    baseId: parsed.baseId,
    variantId: parsed.variantId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    format: parsed.format ?? "md",
    ...parsed.output === void 0 ? {} : { output: parsed.output },
    debug: parsed.debug === true
  };
}
function diffHelp() {
  return [
    "Usage: forkpoint diff <base> <variant> [--store <dir>] [--format md|json] [-o <file>]",
    "",
    "Align LLM and tool steps by callsite and per-callsite ordinal, then report the first",
    "behavioral divergence with field-level changes and token/latency metrics.",
    "",
    "Options:",
    "  --store <dir>       Cassette directory (default: .forkpoint)",
    "  --format md|json    Output format (default: md)",
    "  --json              Shortcut for --format json",
    "  -o, --output <file> Write the report to a file",
    "  --debug             Print stack traces on failure"
  ].join("\n");
}
function valueOf(args, index, flag) {
  const value = args[index + 1];
  if (value === void 0) throw new UsageError(`${flag} requires a value.`);
  return value;
}
function parseFormat(value) {
  if (value === "md" || value === "json") return value;
  throw new UsageError(`--format must be "md" or "json", got "${value}".`);
}

// src/cli/fork.ts
import { readFileSync as readFileSync2 } from "node:fs";
import path7 from "node:path";

// src/sdk/overrides.ts
var ALLOWED_KEYS = /* @__PURE__ */ new Set(["model", "temperature", "systemPrompt"]);
function validateForkOverrides(input) {
  if (!isRecord(input)) {
    throw new UsageError("Fork overrides must be a JSON object.");
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UsageError(`Unknown fork override: ${key}. Allowed: model, temperature, systemPrompt.`);
    }
  }
  const overrides = {};
  if (input.model !== void 0) {
    if (typeof input.model !== "string" || input.model.trim() === "") {
      throw new UsageError("Fork override model must be a non-empty string.");
    }
    overrides.model = input.model;
  }
  if (input.temperature !== void 0) {
    if (typeof input.temperature !== "number" || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) {
      throw new UsageError("Fork override temperature must be a number between 0 and 2.");
    }
    overrides.temperature = input.temperature;
  }
  if (input.systemPrompt !== void 0) {
    if (typeof input.systemPrompt !== "string") {
      throw new UsageError("Fork override systemPrompt must be a string.");
    }
    overrides.systemPrompt = input.systemPrompt;
  }
  return overrides;
}
function hasForkOverrides(overrides) {
  return overrides.model !== void 0 || overrides.temperature !== void 0 || overrides.systemPrompt !== void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/cli/fork.ts
async function executeFork(options) {
  if (!hasForkOverrides(options.overrides)) {
    throw new UsageError(
      "fork requires at least one override: --model, --temperature, or --system-prompt-file."
    );
  }
  const store = path7.resolve(options.store);
  const baseline = readBaseline(store, options.runId);
  if (baseline.status === "recording") {
    throw new UsageError(`Run ${baseline.id} is still recording; let it finish before forking.`);
  }
  const resolved = resolveCommand(baseline, options.command, "fork");
  const commandText = formatCommand(resolved.command, resolved.args);
  const variantId = createRunId();
  const metadata = collectRunMetadata(commandText);
  const name = options.name?.trim() === "" ? void 0 : options.name;
  const cassette = openCassette(store);
  try {
    cassette.createRun({
      id: variantId,
      name: name ?? baseline.name,
      parentRunId: baseline.id,
      mode: "forked",
      status: "recording",
      command: commandText,
      cwd: metadata.cwd,
      ...metadata.gitSha === void 0 ? {} : { gitSha: metadata.gitSha },
      nodeVersion: metadata.nodeVersion,
      platform: metadata.platform,
      config: {
        forkedFrom: baseline.id,
        overrides: options.overrides,
        argv: [resolved.command, ...resolved.args]
      }
    });
  } finally {
    cassette.close();
  }
  const outcome = await spawnChild({
    command: resolved.command,
    args: resolved.args,
    store,
    mode: "fork",
    runId: variantId,
    baselineRunId: baseline.id,
    commandText,
    quiet: options.quiet === true,
    extraEnv: { FORKPOINT_OVERRIDES: JSON.stringify(options.overrides) }
  });
  const finalized = finalizeChildRun({
    runId: variantId,
    store,
    outcome,
    finalStatus: "forked",
    json: options.json,
    debug: options.debug,
    missingStartMessage: "forkpoint: the child process never started a fork. Did it call fp.run()?",
    incompleteMessage: "forkpoint: the child exited without a complete fork; no run.end was recorded."
  });
  return {
    runId: variantId,
    baselineRunId: baseline.id,
    status: finalized.status,
    childExitCode: finalized.childExitCode
  };
}
async function forkCommand(options) {
  const result = await executeFork(options);
  if (options.json) {
    printJson({ ok: result.status === "forked", ...result });
  } else if (result.status === "forked") {
    process.stdout.write(`Forked run ${result.runId} from ${result.baselineRunId}
`);
  } else {
    process.stdout.write(`Fork failed; partial cassette kept for run ${result.runId}
`);
  }
  if (result.childExitCode === 2) return 2;
  if (result.childExitCode !== 0) return result.childExitCode;
  return result.status === "forked" ? 0 : 1;
}
function parseForkArguments(args) {
  if (args.includes("--help") || args.includes("-h")) return "help";
  const separator = args.indexOf("--");
  const optionArgs = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const parsed = { command };
  for (let index = 0; index < optionArgs.length; index += 1) {
    const argument = optionArgs[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--store") {
      parsed.store = requireValue(optionArgs, index, "--store");
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument === "--name") {
      parsed.name = requireValue(optionArgs, index, "--name");
      index += 1;
      continue;
    }
    if (argument.startsWith("--name=")) {
      parsed.name = argument.slice("--name=".length);
      continue;
    }
    if (argument === "--model") {
      parsed.model = requireValue(optionArgs, index, "--model");
      index += 1;
      continue;
    }
    if (argument.startsWith("--model=")) {
      parsed.model = argument.slice("--model=".length);
      continue;
    }
    if (argument === "--temperature") {
      parsed.temperature = parseTemperature(requireValue(optionArgs, index, "--temperature"));
      index += 1;
      continue;
    }
    if (argument.startsWith("--temperature=")) {
      parsed.temperature = parseTemperature(argument.slice("--temperature=".length));
      continue;
    }
    if (argument === "--system-prompt-file") {
      parsed.systemPromptFile = requireValue(optionArgs, index, "--system-prompt-file");
      index += 1;
      continue;
    }
    if (argument.startsWith("--system-prompt-file=")) {
      parsed.systemPromptFile = argument.slice("--system-prompt-file=".length);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown fork option: ${argument}`);
    }
    if (parsed.runId !== void 0) {
      throw new UsageError(`Unexpected argument: ${argument}`);
    }
    parsed.runId = argument;
  }
  return parsed;
}
function toForkOptions(parsed, storeFromOption) {
  if (parsed.runId === void 0 || parsed.runId.trim() === "") {
    throw new UsageError("fork requires a run id.");
  }
  const overrides = validateForkOverrides({
    ...parsed.model === void 0 ? {} : { model: parsed.model },
    ...parsed.temperature === void 0 ? {} : { temperature: parsed.temperature },
    ...parsed.systemPromptFile === void 0 ? {} : { systemPrompt: readSystemPrompt(parsed.systemPromptFile) }
  });
  if (!hasForkOverrides(overrides)) {
    throw new UsageError(
      "fork requires at least one override: --model, --temperature, or --system-prompt-file."
    );
  }
  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true,
    ...parsed.name === void 0 ? {} : { name: parsed.name },
    overrides,
    command: parsed.command
  };
}
function forkHelp() {
  return [
    "Usage: forkpoint fork <run_id> [--model <name>] [--temperature <n>] [--system-prompt-file <path>]",
    "                      [--name <name>] [--store <dir>] [--json] -- [command...]",
    "",
    "Re-execute the run with live model calls. Tool calls are served from the baseline",
    "cassette and never executed, so a fork isolates how the model responds to a change.",
    "",
    "Options:",
    "  --model <name>             Override the model on every LLM call",
    "  --temperature <n>          Override the sampling temperature (0..2)",
    "  --system-prompt-file <p>   Replace the system prompt on every LLM call",
    "  --name <name>              Name the forked run",
    "  --store <dir>              Cassette directory (default: .forkpoint)",
    "  --json                     Print the final result as JSON",
    "  --debug                    Print stack traces on failure",
    "",
    "At least one override is required. The original command is reused unless one is passed after --."
  ].join("\n");
}
function requireValue(args, index, option) {
  const value = args[index + 1];
  if (value === void 0) throw new UsageError(`${option} requires a value.`);
  return value;
}
function parseTemperature(raw) {
  if (raw.trim() === "") {
    throw new UsageError("--temperature must be a number between 0 and 2.");
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UsageError("--temperature must be a number between 0 and 2.");
  }
  return value;
}
function readSystemPrompt(file) {
  try {
    return readFileSync2(path7.resolve(file), "utf8");
  } catch (error) {
    throw new UsageError(
      `Cannot read --system-prompt-file ${file}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// src/cli/export.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "node:fs";
import path8 from "node:path";

// src/core/redact.ts
var REDACTED = "[REDACTED]";
var SENSITIVE_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "api-key",
  "x-api-key",
  "cookie",
  "set-cookie"
]);
var SENSITIVE_ENV_SUFFIX = /(_KEY|_TOKEN|_SECRET|_PASSWORD)$/i;
var SECRET_PATTERNS = [
  { name: "openai-key", pattern: /sk-[A-Za-z0-9_-]{8,}/g },
  { name: "github-token", pattern: /ghp_[A-Za-z0-9]{8,}/g },
  { name: "aws-access-key", pattern: /AKIA[0-9A-Z]{12,}/g },
  { name: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{8,}/g }
];
function deserializeRedactionRules(raw, context = "stored redaction rules") {
  if (raw === void 0 || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new UsageError(`${context} must be an array.`);
  }
  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new UsageError(`${context}[${index}] must be an object.`);
    }
    const record = entry;
    const name = record.name;
    const source = record.source;
    const flags = record.flags ?? "";
    const replacement = record.replacement;
    if (typeof name !== "string" || name.trim() === "") {
      throw new UsageError(`${context}[${index}].name must be a non-empty string.`);
    }
    if (typeof source !== "string" || source === "") {
      throw new UsageError(`${context}[${index}] (${name}).source must be a non-empty string.`);
    }
    if (typeof flags !== "string") {
      throw new UsageError(`${context}[${index}] (${name}).flags must be a string.`);
    }
    if (typeof replacement !== "string") {
      throw new UsageError(`${context}[${index}] (${name}).replacement must be a string.`);
    }
    try {
      new RegExp(source, flags);
    } catch (error) {
      throw new UsageError(
        `${context}[${index}] (${name}) is not a valid regular expression: ${errorMessage(error)}`
      );
    }
    return { name, source, flags, replacement };
  });
}
function readStoredRedactionRules(config) {
  if (typeof config !== "object" || config === null) return [];
  const raw = config.redactionPatterns;
  return deserializeRedactionRules(raw);
}
function createRedactor(rules) {
  const compiled = rules.map((rule) => ({
    pattern: globalPattern(rule),
    replacement: rule.replacement
  }));
  return (value, options = {}) => redactNode(value, compiled, options.redactEnvKeys === true);
}
function scanSecrets(value) {
  const matches = [];
  scanNode(value, "$", matches);
  return matches;
}
function globalPattern(rule) {
  const flags = `${rule.flags.replace(/[gy]/g, "")}g`;
  return new RegExp(rule.source, flags);
}
function redactNode(value, rules, redactEnvKeys) {
  if (typeof value === "string") return applyRules(value, rules);
  if (Array.isArray(value)) {
    return value.map((item) => redactNode(item, rules, redactEnvKeys));
  }
  if (typeof value !== "object" || value === null) return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase()) || redactEnvKeys && SENSITIVE_ENV_SUFFIX.test(key)) {
      output[key] = REDACTED;
    } else {
      output[key] = redactNode(child, rules, redactEnvKeys);
    }
  }
  return output;
}
function applyRules(value, rules) {
  let result = value;
  for (const rule of rules) result = result.replace(rule.pattern, rule.replacement);
  return result;
}
function scanNode(value, path10, matches) {
  if (typeof value === "string") {
    for (const candidate of SECRET_PATTERNS) {
      candidate.pattern.lastIndex = 0;
      if (candidate.pattern.test(value)) {
        matches.push({ pattern: candidate.name, field: path10 });
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanNode(item, `${path10}[${index}]`, matches));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    scanNode(child, `${path10}${segment}`, matches);
  }
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/cli/export.ts
function buildExport(run, events, fixtures, options = {}) {
  const rules = storedRedactionRules(run);
  const redactor = createRedactor(rules);
  const records = [
    {
      record: "meta",
      ref: "run",
      value: {
        kind: "meta",
        format: "forkpoint-export",
        formatVersion: 1,
        exportedAt: (options.now ?? /* @__PURE__ */ new Date()).toISOString(),
        redacted: true,
        replayable: false,
        notice: "Redacted export for sharing and inspection. It is not a replayable cassette.",
        run: redactRun(run, redactor),
        redaction: { builtin: true, rules: rules.map((rule) => rule.name) }
      }
    }
  ];
  for (const event of events) {
    records.push({
      record: "event",
      ref: `seq ${event.seq}`,
      value: {
        kind: "event",
        event: {
          ...event,
          payload: event.type === "env.snapshot" ? redactor(event.payload, { redactEnvKeys: true }) : redactor(event.payload)
        }
      }
    });
  }
  for (const fixture of fixtures) {
    records.push({
      record: "fixture",
      ref: `${fixture.kind}/${fixture.fixtureKey.slice(0, 12)}/${fixture.occurrence}`,
      value: {
        kind: "fixture",
        fixture: {
          kind: fixture.kind,
          fixtureKey: fixture.fixtureKey,
          occurrence: fixture.occurrence,
          ...fixture.callsite === void 0 ? {} : { callsite: fixture.callsite },
          ...fixture.requestJson === void 0 ? {} : { request: redactor(parseJson(fixture.requestJson)) },
          ...fixture.response === void 0 ? {} : { response: redactor(fixture.response) },
          ...fixture.meta === void 0 ? {} : { meta: redactor(fixture.meta) }
        }
      }
    });
  }
  const lines = [];
  const findings = [];
  records.forEach((entry, index) => {
    lines.push(JSON.stringify(entry.value));
    for (const match of scanSecrets(entry.value)) {
      findings.push({
        ...match,
        line: index + 1,
        record: entry.record,
        ref: entry.ref
      });
    }
  });
  return {
    lines,
    findings,
    events: events.length,
    fixtures: fixtures.length,
    rules: rules.map((rule) => rule.name)
  };
}
async function exportCommand(options) {
  if (!options.redact) {
    throw new UsageError(
      "export requires --redact; Forkpoint does not write raw cassettes to shareable files."
    );
  }
  if (options.json && options.output === void 0) {
    throw new UsageError("--json requires -o <file>; JSONL is written to stdout otherwise.");
  }
  const store = path8.resolve(options.store);
  const cassette = openExistingCassette(store);
  if (cassette === void 0) throw new RunNotFoundError(options.runId, store);
  const cassetteFile = path8.resolve(cassette.file);
  let document;
  try {
    const run = cassette.getRun(options.runId);
    if (run === void 0) throw new RunNotFoundError(options.runId, store);
    if (run.status === "recording") {
      throw new UsageError(`Run ${run.id} is still recording; export after it finishes.`);
    }
    document = buildExport(run, cassette.getEvents(run.id), cassette.listFixtures(run.id));
  } finally {
    cassette.close();
  }
  const jsonl = `${document.lines.join("\n")}
`;
  if (options.output === void 0) {
    process.stdout.write(jsonl);
    process.stderr.write(`${renderSummary(document, void 0)}
`);
    return 0;
  }
  const target = path8.resolve(options.output);
  if (target === cassetteFile) {
    throw new UsageError("Refusing to overwrite the cassette file; choose another -o path.");
  }
  mkdirSync2(path8.dirname(target), { recursive: true });
  writeFileSync2(target, jsonl, "utf8");
  if (options.json) {
    printJson({
      ok: true,
      runId: options.runId,
      output: target,
      redacted: true,
      replayable: false,
      events: document.events,
      fixtures: document.fixtures,
      rules: document.rules,
      findings: document.findings
    });
  } else {
    process.stdout.write(`${renderSummary(document, target)}
`);
  }
  return 0;
}
function storedRedactionRules(run) {
  if (run.configJson === void 0) return [];
  let config;
  try {
    config = JSON.parse(run.configJson);
  } catch {
    throw new UsageError(`Run ${run.id} has unreadable config; cannot apply its redaction rules.`);
  }
  return readStoredRedactionRules(config);
}
function redactRun(run, redactor) {
  return {
    id: run.id,
    name: redactor(run.name),
    createdAt: run.createdAt,
    ...run.parentRunId === void 0 ? {} : { parentRunId: run.parentRunId },
    mode: run.mode,
    status: run.status,
    ...run.command === void 0 ? {} : { command: redactor(run.command) },
    ...run.cwd === void 0 ? {} : { cwd: redactor(run.cwd) },
    ...run.gitSha === void 0 ? {} : { gitSha: run.gitSha },
    ...run.nodeVersion === void 0 ? {} : { nodeVersion: run.nodeVersion },
    ...run.platform === void 0 ? {} : { platform: run.platform },
    ...run.seed === void 0 ? {} : { seed: run.seed },
    ...run.metricsJson === void 0 ? {} : { metrics: redactor(parseJson(run.metricsJson)) },
    ...run.envJson === void 0 ? {} : { env: redactor(parseJson(run.envJson), { redactEnvKeys: true }) }
  };
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function renderSummary(document, output) {
  const destination = output === void 0 ? "stdout" : output;
  const lines = [
    `Exported ${document.events} events and ${document.fixtures} fixtures to ${destination}.`,
    `Redacted: built-in header/env rules${document.rules.length === 0 ? "" : ` + custom rules: ${document.rules.join(", ")}`}.`,
    "The exported JSONL is for sharing and inspection; it is not replayable."
  ];
  if (document.findings.length === 0) {
    lines.push("Secret scan: no known token patterns found.");
    return lines.join("\n");
  }
  lines.push(`Secret scan: ${document.findings.length} potential secret(s) remain:`);
  for (const finding of document.findings) {
    lines.push(
      `  line ${finding.line} ${finding.record} ${finding.ref} ${finding.field} matched ${finding.pattern}`
    );
  }
  return lines.join("\n");
}
function parseExportArguments(args) {
  if (args.includes("--help") || args.includes("-h")) return "help";
  const parsed = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--redact") {
      parsed.redact = true;
      continue;
    }
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--store") {
      parsed.store = valueOf2(args, index, "--store");
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument === "-o" || argument === "--output") {
      parsed.output = valueOf2(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown export option: ${argument}`);
    }
    positional.push(argument);
  }
  if (positional.length > 1) throw new UsageError(`Unexpected argument: ${positional[1]}`);
  parsed.runId = positional[0];
  return parsed;
}
function toExportOptions(parsed, storeFromOption) {
  if (parsed.runId === void 0) {
    throw new UsageError(
      "export requires a run id: forkpoint export <run_id> --redact -o <file>"
    );
  }
  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    redact: parsed.redact === true,
    ...parsed.output === void 0 ? {} : { output: parsed.output },
    json: parsed.json === true,
    debug: parsed.debug === true
  };
}
function exportHelp() {
  return [
    "Usage: forkpoint export <run_id> --redact [-o <file>] [--store <dir>] [--json]",
    "",
    "Write a shareable JSONL export: one meta line, then every event, then every fixture.",
    "Built-in header/env redaction is always applied, followed by rules configured via the",
    "SDK's redact option. The file is scanned for known token patterns afterwards.",
    "",
    "The export is redacted for sharing and is not replayable. Raw export is not supported.",
    "",
    "Options:",
    "  --redact            Required; acknowledges that the export is redacted, not raw",
    "  -o, --output <file> Write JSONL to a file (default: stdout)",
    "  --store <dir>       Cassette directory (default: .forkpoint)",
    "  --json              Print a machine-readable summary (requires -o)",
    "  --debug             Print stack traces on failure"
  ].join("\n");
}
function valueOf2(args, index, flag) {
  const value = args[index + 1];
  if (value === void 0) throw new UsageError(`${flag} requires a value.`);
  return value;
}

// src/cli/observe.ts
import { readFileSync as readFileSync3 } from "node:fs";

// src/observe/record.ts
import path9 from "node:path";
var OBSERVE_EVENTS = /* @__PURE__ */ new Set([
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SessionEnd"
]);
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Task"]);
function recordObserveEvent(options) {
  const event = options.event ?? options.input.hook_event_name;
  if (event === void 0 || event === "") {
    throw new UsageError("observe hook input is missing hook_event_name.");
  }
  if (!OBSERVE_EVENTS.has(event)) {
    return { runId: "", event, recorded: false };
  }
  const sessionId = options.input.session_id;
  if (typeof sessionId !== "string" || sessionId === "") {
    throw new UsageError("observe hook input is missing session_id.");
  }
  const cassette = openCassette(options.store);
  try {
    const run = ensureObservedRun(cassette, options.input, sessionId);
    if (event === "SessionStart") {
      appendObserveStart(cassette, run, options.input);
    } else if (event === "PreToolUse") {
      recordToolCall(cassette, run, options.input);
    } else if (event === "PostToolUse") {
      recordToolResult(cassette, run, options.input);
    } else if (event === "PostToolUseFailure") {
      recordToolFailure(cassette, run, options.input);
    } else {
      finalizeObservedRun(cassette, run, options.input);
    }
    return { runId: run.id, event, recorded: true };
  } finally {
    cassette.close();
  }
}
function resolveObserveStore(input, override) {
  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
  const candidate = override ?? process.env.FORKPOINT_STORE;
  if (candidate === void 0 || candidate === "") return path9.resolve(cwd, ".forkpoint");
  return path9.isAbsolute(candidate) ? candidate : path9.resolve(cwd, candidate);
}
function ensureObservedRun(cassette, input, sessionId) {
  const runId = `obs_${sessionId}`;
  const existing = cassette.getRun(runId);
  if (existing !== void 0) return existing;
  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
  const name = observedName(input, sessionId);
  const config = {
    source: "claude-code",
    sessionId,
    ...typeof input.transcript_path === "string" ? { transcriptPath: input.transcript_path } : {},
    ...typeof input.model === "string" ? { model: input.model } : {},
    ...typeof input.agent_type === "string" ? { agentType: input.agent_type } : {},
    ...typeof input.source === "string" ? { sessionSource: input.source } : {}
  };
  const gitSha = readGitSha(cwd);
  try {
    cassette.createRun({
      id: runId,
      name,
      mode: "observed",
      status: "observing",
      command: "claude-code",
      cwd,
      ...gitSha === void 0 ? {} : { gitSha },
      config
    });
  } catch (error) {
    if (!(error instanceof RunExistsError)) throw error;
    const raced = cassette.getRun(runId);
    if (raced === void 0) throw error;
    return raced;
  }
  const created = cassette.getRun(runId);
  if (created === void 0) {
    throw new UsageError(`Observed run ${runId} was created but could not be read back.`);
  }
  return created;
}
function appendObserveStart(cassette, run, input) {
  if (run.status !== "observed" && cassette.hasEventType(run.id, "observe.start")) return;
  cassette.appendEventNow(run.id, {
    type: "observe.start",
    payload: {
      name: run.name,
      source: "claude-code",
      sessionId: input.session_id,
      ...typeof input.transcript_path === "string" ? { transcriptPath: input.transcript_path } : {},
      ...typeof input.model === "string" ? { model: input.model } : {},
      ...typeof input.agent_type === "string" ? { agentType: input.agent_type } : {},
      ...typeof input.source === "string" ? { sessionSource: input.source } : {}
    }
  });
  if (run.status === "observed") cassette.updateRunStatus(run.id, "observing");
}
function recordToolCall(cassette, run, input) {
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName === "") return;
  const args = input.tool_input ?? null;
  const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : void 0;
  const event = {
    type: "tool.call",
    payload: {
      name: toolName,
      args,
      isWrite: WRITE_TOOLS.has(toolName),
      ...toolUseId === void 0 ? {} : { toolUseId }
    },
    callsite: `claude-code:${toolName}`,
    requestHash: fingerprintValue(args),
    ...toolUseId === void 0 ? {} : { spanId: toolUseId }
  };
  cassette.appendEventNow(run.id, event);
}
function recordToolResult(cassette, run, input) {
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName === "") return;
  const output = input.tool_output ?? input.tool_response ?? null;
  const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : void 0;
  const event = {
    type: "tool.result",
    payload: {
      name: toolName,
      result: output,
      ...toolUseId === void 0 ? {} : { toolUseId }
    },
    callsite: `claude-code:${toolName}`,
    responseHash: fingerprintValue(output),
    ...toolUseId === void 0 ? {} : { spanId: toolUseId }
  };
  cassette.appendEventNow(run.id, event);
}
function recordToolFailure(cassette, run, input) {
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName === "") return;
  const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : void 0;
  const interrupted = input.is_interrupt === true;
  const event = {
    type: "tool.error",
    payload: {
      name: toolName,
      errorName: interrupted ? "ToolInterrupted" : "ToolError",
      message: hookErrorMessage(input.error),
      ...interrupted ? { isInterrupt: true } : {},
      ...toolUseId === void 0 ? {} : { toolUseId }
    },
    callsite: `claude-code:${toolName}`,
    responseHash: fingerprintValue(input.error ?? null),
    ...toolUseId === void 0 ? {} : { spanId: toolUseId }
  };
  cassette.appendEventNow(run.id, event);
}
function hookErrorMessage(error) {
  if (typeof error === "string" && error !== "") return error;
  if (error === void 0 || error === null) return "Tool failed without an error message.";
  const serialized = JSON.stringify(error);
  return serialized === void 0 ? String(error) : serialized;
}
function finalizeObservedRun(cassette, run, input) {
  if (run.status === "observed") return;
  const now = realNow();
  const startedAt = Date.parse(run.createdAt);
  const durationMs = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : void 0;
  const reason = typeof input.reason === "string" && input.reason !== "" ? input.reason : void 0;
  cassette.appendEventNow(run.id, {
    type: "run.end",
    payload: { status: "ok", ...reason === void 0 ? {} : { reason } },
    ...durationMs === void 0 ? {} : { durationMs }
  });
  cassette.updateRunStatus(run.id, "observed", {
    ...durationMs === void 0 ? {} : { durationMs },
    events: cassette.countEvents(run.id),
    toolCalls: cassette.getEventsByType(run.id, "tool.call").length
  });
}
function observedName(input, sessionId) {
  const title = typeof input.session_title === "string" && input.session_title.trim() !== "" ? input.session_title.trim() : sessionId.slice(0, 8);
  return `claude-code: ${title.slice(0, 80)}`;
}

// src/cli/observe.ts
async function observeHookCommand(options) {
  const input = parseHookInput(readStdin());
  const store = resolveObserveStore(input, options.store);
  const result = recordObserveEvent({
    store,
    input,
    ...options.event === void 0 ? {} : { event: options.event }
  });
  if (options.json) printJson({ ok: true, store, ...result });
  return 0;
}
function readStdin() {
  if (process.stdin.isTTY) {
    throw new UsageError(
      "observe hook reads a Claude Code hook payload from stdin; pipe JSON or use it from hooks.json."
    );
  }
  return readFileSync3(0, "utf8");
}
function parseHookInput(raw) {
  if (raw.trim() === "") {
    throw new UsageError("observe hook input is empty; expected a JSON object on stdin.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError("observe hook input is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UsageError("observe hook input must be a JSON object.");
  }
  return parsed;
}
function parseObserveArguments(args) {
  if (args.includes("--help") || args.includes("-h")) return "help";
  const parsed = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--event") {
      parsed.event = valueOf3(args, index, "--event");
      index += 1;
      continue;
    }
    if (argument.startsWith("--event=")) {
      parsed.event = argument.slice("--event=".length);
      continue;
    }
    if (argument === "--store") {
      parsed.store = valueOf3(args, index, "--store");
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown observe option: ${argument}`);
    }
    positional.push(argument);
  }
  if (positional.length > 1) throw new UsageError(`Unexpected argument: ${positional[1]}`);
  parsed.subcommand = positional[0];
  return parsed;
}
function toObserveOptions(parsed) {
  if (parsed.subcommand !== "hook") {
    throw new UsageError(
      "observe requires the hook subcommand: forkpoint observe hook [--event <name>]"
    );
  }
  if (parsed.event !== void 0 && parsed.event.trim() === "") {
    throw new UsageError("--event must not be empty.");
  }
  return {
    ...parsed.event === void 0 ? {} : { event: parsed.event },
    ...parsed.store === void 0 ? {} : { store: parsed.store },
    json: parsed.json === true
  };
}
function observeHelp() {
  return [
    "Usage: forkpoint observe hook [--event <name>] [--store <dir>] [--json]",
    "",
    "Read a Claude Code hook payload from stdin and append it to an observed trace.",
    "",
    "Observed traces record tool calls from a Claude Code session. They are not replayable",
    "and never take part in verify: the host session's LLM traffic, clock, and RNG are",
    "outside the plugin's control. Use `forkpoint diff` to compare observed runs.",
    "",
    "Options:",
    "  --event <name>  Override hook_event_name from the payload",
    "  --store <dir>   Cassette directory (default: <hook cwd>/.forkpoint)",
    "  --json          Print a machine-readable result (hooks should stay quiet)",
    "",
    "Records SessionStart, PreToolUse, PostToolUse, PostToolUseFailure, and SessionEnd; other events are ignored."
  ].join("\n");
}
function valueOf3(args, index, flag) {
  const value = args[index + 1];
  if (value === void 0) throw new UsageError(`${flag} requires a value.`);
  return value;
}

// src/cli/index.ts
var argv = process.argv.slice(2);
if (argv[0] === "record") {
  await runRecord(argv.slice(1));
} else if (argv[0] === "replay") {
  await runReplay(argv.slice(1));
} else if (argv[0] === "verify") {
  await runVerify(argv.slice(1));
} else if (argv[0] === "diff") {
  await runDiff(argv.slice(1));
} else if (argv[0] === "fork") {
  await runFork(argv.slice(1));
} else if (argv[0] === "export") {
  await runExport(argv.slice(1));
} else if (argv[0] === "observe") {
  await runObserve(argv.slice(1));
} else if (argv.length === 0) {
  buildProgram().outputHelp();
} else {
  await runProgram(argv);
}
async function runRecord(args) {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseRecordArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${recordHelp()}
`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await recordCommand(toRecordOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}
async function runReplay(args) {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseReplayArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${replayHelp()}
`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await replayCommand(toReplayOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}
async function runVerify(args) {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseVerifyArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${verifyHelp()}
`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await verifyCommand(toVerifyOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}
async function runDiff(args) {
  const formatIndex = args.indexOf("--format");
  const wantsJson = args.includes("--json") || args.includes("--format=json") || formatIndex !== -1 && args[formatIndex + 1] === "json";
  try {
    const parsed = parseDiffArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${diffHelp()}
`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await diffCommand(toDiffOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}
async function runFork(args) {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseForkArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${forkHelp()}
`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await forkCommand(toForkOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}
async function runExport(args) {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseExportArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${exportHelp()}
`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await exportCommand(toExportOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}
async function runObserve(args) {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseObserveArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${observeHelp()}
`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await observeHookCommand(toObserveOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}
function buildProgram() {
  const program2 = new Command();
  program2.name("forkpoint").description("Record once. Replay deterministically. Find the fork.").version(VERSION, "-v, --version").option("--store <dir>", "cassette directory", ".forkpoint").option("--json", "machine-readable output").option("--verbose", "verbose output").option("--debug", "print stack traces").showHelpAfterError().exitOverride();
  program2.command("record").description("Record an agent run by re-executing a command").option("--name <name>", "run name").option("--store <dir>", "cassette directory").option("--json", "machine-readable output").option("--debug", "print stack traces").allowUnknownOption(true).action(() => {
    throw new UsageError(
      "record must be the first argument: forkpoint record --name <name> -- <command...>"
    );
  });
  program2.command("replay").description("Replay a recorded run against the cassette").allowUnknownOption(true).action(() => {
    throw new UsageError(
      "replay must be the first argument: forkpoint replay <run_id> [-- <command...>]"
    );
  });
  program2.command("verify").description("Replay a run twice and compare stable event hashes").allowUnknownOption(true).action(() => {
    throw new UsageError(
      "verify must be the first argument: forkpoint verify <run_id>"
    );
  });
  program2.command("diff").description("Compare two runs and locate the first divergence").allowUnknownOption(true).action(() => {
    throw new UsageError(
      "diff must be the first argument: forkpoint diff <base> <variant>"
    );
  });
  program2.command("fork").description("Re-run a recorded run against live models with frozen tools").allowUnknownOption(true).action(() => {
    throw new UsageError(
      "fork must be the first argument: forkpoint fork <run_id> --model <name> [-- <command...>]"
    );
  });
  program2.command("export").description("Write a redacted, shareable JSONL export of a run").allowUnknownOption(true).action(() => {
    throw new UsageError(
      "export must be the first argument: forkpoint export <run_id> --redact [-o <file>]"
    );
  });
  program2.command("observe").description("Record Claude Code hook payloads as an observe-only trace").allowUnknownOption(true).action(() => {
    throw new UsageError(
      "observe must be the first argument: forkpoint observe hook [--event <name>]"
    );
  });
  program2.command("ls").description("List recorded runs").option("--limit <count>", "maximum number of runs", "20").option("--store <dir>", "cassette directory").option("--json", "machine-readable output").option("--debug", "print stack traces").action((options, command) => {
    const merged = mergeOptions(command);
    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new UsageError("--limit must be a positive integer.");
    }
    const cassette = openExistingCassette(merged.store);
    if (cassette === void 0) {
      if (merged.json) printJson({ runs: [] });
      else process.stdout.write("No runs.\n");
      return;
    }
    try {
      const runs = cassette.listRuns(limit);
      if (merged.json) {
        printJson({ runs });
      } else {
        process.stdout.write(`${formatRunTable(runs)}
`);
      }
    } finally {
      cassette.close();
    }
  });
  program2.command("show").description("Show a recorded run").argument("<runId>", "run id").option("--events", "include the event list").option("--store <dir>", "cassette directory").option("--json", "machine-readable output").option("--debug", "print stack traces").action((runId, options, command) => {
    const merged = mergeOptions(command);
    const cassette = openExistingCassette(merged.store);
    if (cassette === void 0) throw new RunNotFoundError(runId, merged.store);
    try {
      const run = cassette.getRun(runId);
      if (run === void 0) throw new RunNotFoundError(runId, merged.store);
      const events = options.events === true ? cassette.getEvents(runId) : void 0;
      if (merged.json) {
        printJson(events === void 0 ? { run } : { run, events });
      } else {
        showRun(run, events);
      }
    } finally {
      cassette.close();
    }
  });
  return program2;
}
async function runProgram(args) {
  const program2 = buildProgram();
  try {
    await program2.parseAsync(["node", "forkpoint", ...args]);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode === 0 ? 0 : 2;
      return;
    }
    process.exitCode = printError(error, {
      json: args.includes("--json"),
      debug: args.includes("--debug")
    });
  }
}
function mergeOptions(command) {
  const local = command.opts();
  const global2 = command.parent?.opts() ?? {};
  return {
    store: local.store ?? global2.store ?? ".forkpoint",
    json: local.json ?? global2.json,
    verbose: local.verbose ?? global2.verbose,
    debug: local.debug ?? global2.debug
  };
}
function showRun(run, events) {
  const lines = [
    `Run ${run.id}`,
    `  name:      ${run.name}`,
    `  status:    ${run.status}`,
    `  mode:      ${run.mode}`,
    `  created:   ${run.createdAt}`
  ];
  if (run.command !== void 0) lines.push(`  command:   ${run.command}`);
  if (run.cwd !== void 0) lines.push(`  cwd:       ${run.cwd}`);
  if (run.gitSha !== void 0) lines.push(`  git:       ${run.gitSha}`);
  if (run.nodeVersion !== void 0) lines.push(`  node:      ${run.nodeVersion}`);
  if (run.platform !== void 0) lines.push(`  platform:  ${run.platform}`);
  if (run.parentRunId !== void 0) lines.push(`  parent:    ${run.parentRunId}`);
  if (run.metricsJson !== void 0) lines.push(`  metrics:   ${run.metricsJson}`);
  if (run.envJson !== void 0) lines.push(`  env:       ${run.envJson}`);
  process.stdout.write(`${lines.join("\n")}
`);
  if (events === void 0) return;
  process.stdout.write(`
Events (${events.length}):
`);
  if (events.length === 0) {
    process.stdout.write("  (none)\n");
    return;
  }
  const header = "SEQ   TYPE                 CALLSITE                                      DURATION";
  process.stdout.write(`  ${header}
`);
  for (const event of events) {
    const duration = event.durationMs === void 0 ? "" : `${event.durationMs.toFixed(1)}ms`;
    process.stdout.write(
      `  ${String(event.seq).padEnd(5)} ${event.type.padEnd(20)} ${truncate(
        event.callsite ?? "-",
        44
      ).padEnd(44)} ${duration}
`
    );
  }
}
