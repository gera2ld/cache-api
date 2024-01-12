# cache-async-fn

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]

## Usage

### Initialization

With MobX:

```ts
import { observable } from 'mobx';
import { cacheAsyncFactory } from 'cache-async-fn';

function createCache<T>() {
  const target = observable<{ value: Record<string, T | undefined> }>(
    { value: {} },
    {
      value: observable.ref,
    },
  );
  return {
    get(cacheKey: string) {
      return target.value[cacheKey];
    },
    set(cacheKey: string, data?: T) {
      target.value = {
        ...target.value,
        [cacheKey]: data,
      };
    },
    clear() {
      target.value = {};
    },
  };
}

const { cacheAsync } = cacheAsyncFactory(createCache);
```

With Vue:

```ts
import { ref } from 'vue';
import { cacheAsyncFactory } from 'cache-async-fn';

function createCache<T>() {
  const target = ref<Record<string, T | undefined>>({});
  return {
    get(cacheKey: string) {
      return target.value[cacheKey];
    },
    set(cacheKey: string, data?: T) {
      target.value = {
        ...target.value,
        [cacheKey]: data,
      };
    },
    clear() {
      target.value = {};
    },
  };
}
const { cacheAsync } = cacheAsyncFactory(createCache);
```

### Cache APIs

```ts
const myApi = cacheAsync(myApiCall, {
  resolver: (params) => [groupKey, cacheKey],
});

// Call from anywhere
async function someAction() {
  const response = await myApi(params);
}

// Get the current value anytime
function getValueSync() {
  return myApi.get(params);
}
```

Each `groupKey` has its own cache. The cache is invalidated when the `cacheKey` changes.

## Use Cases

### Load once globally

This is the default behavior.

```ts
const loadOnceGlobally = cacheAsync(api);
// or
const loadOnceGlobally = cacheAsync(api, {
  resolver: () => '',
});
```

### Load on param change

```ts
const loadOnParamChange = cacheAsync(api, {
  resolver: (params) => ['', JSON.stringify(params)],
});
```

### Cache data for multiple tabs

The data for each tab will be cached in a different group, with the parameters as its cache key.

```ts
const loadOnParamChange = cacheAsync(api, {
  resolver: (params) => [params.tab, JSON.stringify(params)],
});
```

[npm-version-src]: https://img.shields.io/npm/v/cache-async-fn?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/cache-async-fn
[npm-downloads-src]: https://img.shields.io/npm/dm/cache-async-fn?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/cache-async-fn
[bundle-src]: https://img.shields.io/bundlephobia/minzip/cache-async-fn?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=cache-async-fn
[jsdocs-src]: https://img.shields.io/badge/jsDocs.io-reference-18181B?style=flat&colorA=18181B&colorB=F0DB4F
[jsdocs-href]: https://www.jsdocs.io/package/cache-async-fn
