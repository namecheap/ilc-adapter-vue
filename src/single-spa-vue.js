import "css.escape";

const defaultOpts = {
  // required opts
  Vue: null,
  appOptions: null,
  template: null
};

let errorHandler = null;

export default function singleSpaVue(userOpts) {
  if (typeof userOpts !== "object") {
    throw new Error(`single-spa-vue requires a configuration object`);
  }

  const opts = {
    ...defaultOpts,
    ...userOpts
  };

  if (!opts.Vue) {
    throw Error("single-spa-vue must be passed opts.Vue");
  }

  if (!opts.appOptions) {
    throw Error("single-spa-vue must be passed opts.appOptions");
  }

  if (
    opts.appOptions.el &&
    typeof opts.appOptions.el !== "string" &&
    !(opts.appOptions.el instanceof HTMLElement)
  ) {
    throw Error(
      `single-spa-vue: appOptions.el must be a string CSS selector, an HTMLElement, or not provided at all. Was given ${typeof opts
        .appOptions.el}`
    );
  }

  opts.Vue.config.errorHandler = function(error, vm, info) {
    errorHandler(error, {
      context: info
    });
  };

  const { router } = opts.appOptions;
  if (router) {
    if (
      !router.history ||
      !router.history.current ||
      typeof router.history.updateRoute !== "function"
    ) {
      console.warn(`
        VueRouter should has HTML5History instance. Looks like something was changed under the hood. 
        So probably the current mounting will render previous route that was rendered before unmount.
        Updating route ensured "clean start" for every Vue app mount, with the help of "router.history.updateRoute(startRoute);"
      `);
    } else {
      const startRoute = router.history.current;
      opts._cleanHistory = () => {
        router.history.updateRoute(startRoute);
      };
    }
  }

  // Just a shared object to store the mounted object state
  // key - name of single-spa app, since it is unique
  let mountedInstances = {};

  return {
    bootstrap: bootstrap.bind(null, opts, mountedInstances),
    mount: mount.bind(null, opts, mountedInstances),
    unmount: unmount.bind(null, opts, mountedInstances),
    update: update.bind(null, opts, mountedInstances)
  };
}

function bootstrap(opts, mountedInstances, props) {
  if (typeof props.errorHandler !== "function") {
    return Promise.reject(
      `single-spa-vue: an error handler for vuejs application '${props.name}' is not a function`
    );
  }

  errorHandler = props.errorHandler;

  if (opts.loadRootComponent) {
    return opts.loadRootComponent().then(root => (opts.rootComponent = root));
  } else {
    return Promise.resolve();
  }
}

function mount(opts, mountedInstances, props) {
  const instance = {};
  return Promise.resolve().then(() => {
    opts._cleanHistory && opts._cleanHistory();

    const appOptions = { ...opts.appOptions };
    if (props.domElement) {
      appOptions.el = props.domElement;
    } else if (props.domElementGetter) {
      appOptions.el = props.domElementGetter();
    }

    let domEl;
    if (appOptions.el) {
      if (typeof appOptions.el === "string") {
        domEl = document.querySelector(appOptions.el);
        if (!domEl) {
          throw Error(
            `If appOptions.el is provided to single-spa-vue, the dom element must exist in the dom. Was provided as ${appOptions.el}`
          );
        }
      } else {
        domEl = appOptions.el;
        if (!domEl.id) {
          domEl.id = `single-spa-application:${props.name}`;
        }
        appOptions.el = `#${CSS.escape(domEl.id)}`;
      }
    } else {
      const htmlId = `single-spa-application:${props.name}`;
      appOptions.el = `#${CSS.escape(htmlId)}`;
      domEl = document.getElementById(htmlId);
      if (!domEl) {
        domEl = document.createElement("div");
        domEl.id = htmlId;
        document.body.appendChild(domEl);
      }
    }

    appOptions.el = appOptions.el + " .single-spa-container";

    // single-spa-vue@>=2 always REPLACES the `el` instead of appending to it.
    // We want domEl to stick around and not be replaced. So we tell Vue to mount
    // into a container div inside of the main domEl
    if (!domEl.querySelector(".single-spa-container")) {
      const singleSpaContainer = document.createElement("div");
      singleSpaContainer.className = "single-spa-container";
      domEl.appendChild(singleSpaContainer);
    }

    instance.domEl = domEl;

    if (!appOptions.render && !appOptions.template && opts.rootComponent) {
      appOptions.render = h => h(opts.rootComponent);
    }

    if (!appOptions.data) {
      appOptions.data = {};
    }

    appOptions.data = { ...appOptions.data, ...props };

    instance.vueInstance = new opts.Vue(appOptions);
    if (instance.vueInstance.bind) {
      instance.vueInstance = instance.vueInstance.bind(instance.vueInstance);
    }

    mountedInstances[props.name] = instance;

    return instance.vueInstance;
  });
}

function update(opts, mountedInstances, props) {
  return Promise.resolve().then(() => {
    const instance = mountedInstances[props.name];
    const data = {
      ...(opts.appOptions.data || {}),
      ...props
    };
    for (let prop in data) {
      instance.vueInstance[prop] = data[prop];
    }
  });
}

function unmount(opts, mountedInstances, props) {
  return Promise.resolve().then(() => {
    const instance = mountedInstances[props.name];
    instance.vueInstance.$destroy();
    instance.vueInstance.$el.innerHTML = "";
    delete instance.vueInstance;

    if (instance.domEl) {
      instance.domEl.innerHTML = "";
      delete instance.domEl;
    }
  });
}
