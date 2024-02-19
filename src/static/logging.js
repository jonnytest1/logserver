

/**
 * @type { ((level:LogLevel,message:string|{[key:string]:unknown,message:string},error)=>Promise<Response>) & {
 * attributes?:Record<string,any>
 * withAttributes?:<T>(attributes:Record<string,any>,callback:()=>(T|Promise<T>))=>Promise<T>
 * prefixKeys?(key:string,obj:Record<string,any>):Record<string,any>
 * } }
 */
var logKibana;
/**
 * @type {(e:Error)=>void}
 */
var evalError;

/**
 * @typedef {"INFO"|'ERROR'|'DEBUG'|"WARN"} LogLevel
 */

/**
 * @type {(e:Error)=>void}
 */
var handleError;

var logScr = new EvalScript('', {
  run: async (res, set) => {
    const [http] = await set.globals.reqS(["http"])
    const t = set.globals
    var logHistory = {};

    /**
     *
     * @param {string} value
     */
    function base64safe(value) {
      try {
        btoa(value);
        return value;
      } catch(e) {
        return value.replace(/./g, c => {
          if(c.charCodeAt(0) > 256) {
            return '_';
          }
          return c;
        });
      }
    }
    /**
     *
     * @param {Element} el
     */
    function getElementDescription(el) {
      let elementStr = `${el.tagName}`;
      if(el.id) {
        elementStr += `#${el.id}`;
      }
      if(el.className) {
        elementStr += `.${el.className}`;
      }
      el.getAttributeNames()
        .forEach(attr => {
          elementStr += ` [${attr}]=${base64safe(el.getAttribute(attr))}`;
        });
      if(el.textContent) {
        elementStr += '> \n' + base64safe(el.textContent.split('\n')
          .filter(l => l.trim())
          .map(l => l.trim())
          .join('\n'));
      }
      return elementStr;
    }

    /**
     *
     * @param {Record<string,any>} data
     * @param {Record<string,string|Element>} collector
     */
    function assignb64Safe(data, collector, shortOnly = false) {

      for(let i in data) {
        let key;
        try {
          if(data[i] instanceof Element) {
            key = 'element_' + i;
            collector[key] = data[i];
          } else {
            btoa(JSON.stringify(data[i]));
            if(i === 'message') {
              key = 'message';
              collector.message = data[i];
            } else {
              key = 'msg_' + i;
              collector[key] = data[i];
            }
          }
        } catch(e) {
          try {
            key = 'b64safe_' + i;
            collector[key] = base64safe(JSON.stringify(data[i]));
          } catch(e2) {
            key = 'e_' + i;
            collector[key] = 'error parsing for ' + i;
          }
        }

        if(shortOnly && key) {
          let val = collector[key];
          if(typeof val !== 'string' || val.length > 400) {
            delete collector[key];
          }

        }
      }
    }

    /**
     * @type {typeof logKibana}
     */
    // tslint:disable-next-line: promise-function-async
    const logKibanaImpl = (level, message, error) => {
      let jsonMessage = message;
      if(!jsonMessage && error) {
        jsonMessage = error.message;
      }
      let jsonData = {
        Severity: level,
        application: 'clientJS',
        url: location.href
      };

      if(typeof jsonMessage !== 'string') {
        assignb64Safe(jsonMessage, jsonData);
      } else {
        jsonData.message = base64safe(jsonMessage);
      }

      assignb64Safe(logKibana.attributes, jsonData, !(jsonData.Severity === 'ERROR' || jsonData.Severity === 'WARN'));

      try {
        // @ts-ignore
        undefined.test();
      } catch(stackError) {
        /**
         * @type {string}
         */
        const stack = stackError.stack;
        jsonData.logStack = stack
          .replace('TypeError: Cannot read property \'test\' of undefined', '')
          .replace('TypeError: Cannot read properties of undefined (reading \'test\')', '')
          .replace(/&auth=[^:]*/g, '');
      }

      if(error) {
        jsonData.error_message = error.message;
        jsonData.error_stacktrace = error.stack;
        delete error.message;
        delete error.stack;
        jsonData = { ...jsonData, ...error };
        error.message = jsonData.error_message;
        error.stack = jsonData.error_stacktra;

      }
      return http.http("POST", `${t.backendUrl}/libs/log/index.php`, undefined,
        btoa(JSON.stringify(jsonData, (key, val) => {
          if(val instanceof Element) {
            return getElementDescription(val);
          }
          return val;
        })), {
        'Content-Type': 'text/plain'
      });
    };

    function evalErrorImpl(e) {
      if(!e.stack || !e.stack?.includes('extension') && !e.stack?.includes('<br />')) {
        return;
      }
      handleError(e);
    }

    /**
     * @param {Error} e
     * @global
     */
    function handleErrorImpl(e) {
      logKibana('ERROR', undefined, e);
      let note = '';
      if(typeof scriptContent !== 'undefined') {
        let scriptMessage = scriptContent;
        const splitScriptContent = scriptMessage.split('error</b>:');
        if(splitScriptContent.length > 2) {
          scriptMessage = splitScriptContent[1];
          note = scriptMessage
            .replace(/<br \/>\n/gm, '')
            .replace(/<b>/gm, '')
            .replace(/<\/b>/gm, '')
            .replace('Parse error:', '')
            .replace('syntax error,', '')
            .trim();
        }
      }
      if(note === '') {
        note = e.message;
      }
      if(
        !logHistory[e.stack] ||
        logHistory[e.stack] < new Date().valueOf() - 1000 * 60
      ) {
        logHistory[e.stack] = new Date().valueOf();
        console.error(`${location.href}\n${e.stack}`);

        try {
          GMnot(location.href, note, 'https://www.shareicon.net/data/128x128/2017/06/21/887388_energy_512x512.png', () => {
            try {
              let logContent = `${location.href}\n${e.stack}`;
              t.GM_setClipboard(logContent);
            } catch(error) {
              t.GM_setClipboard(`${location.href}\n${error.stack}`);
            }
          });
        } catch(e) {
          const notificationOptions = {
            title: location.href,
            text: note,
            //silent: true,
            image:
              'https://www.shareicon.net/data/128x128/2017/06/21/887388_energy_512x512.png',
            /* onclick: () => {
  
             }*/
          };

          /*let noti = new Notification(notificationOptions.title, {
            ...notificationOptions, icon: notificationOptions.image, renotify: true
          })
          noti.onclick = notificationOptions.onclick;*/
          t.GM_notification(notificationOptions);
        }

      } else {
        console.trace(e.stack + ' appeared again not sending');
      }
    }

    window.evalError = evalError = evalErrorImpl;
    logKibana = logKibanaImpl;
    logKibana.attributes = {};
    logKibana.withAttributes = async (attributes, callback) => {
      Object.assign(logKibana.attributes, attributes);
      try {
        let result = await callback();
        return result;
      } finally {
        Object.keys(attributes)
          .forEach(key => {
            delete logKibana.attributes[key];
          });
      }
    };
    logKibana.prefixKeys = (key, obj) => {
      const copy = {};
      for(let i in obj) {
        copy[key + i] = obj[i];
      }
      return copy;
    };
    window.LogLevelError = class LogLevelError {
      /**
       *
       * @param {LogLevel} level
       * @param {Record<string,string>} data
       */
      constructor(level, data) {
        this.level = level;
        this.data = data;
      }
    };
    window.logKibana = logKibana;
    window.handleError = handleError = handleErrorImpl;
    window.sc.D.e = handleError;
    window.sc.D.l = (message, error) => {
      logKibana('INFO', message, error);
    };
    res(undefined)
  }
})
logScr