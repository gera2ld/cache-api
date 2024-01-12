export interface ICachedFunction<T extends unknown[], U> {
  (...args: T): Promise<U>;

  /** Return the currently cached value immediately. */
  get(...args: T): U | undefined;

  /** Delete the currently cached value. */
  delete(...args: T): void;

  /** Invalidate the current cached value and send a new request without deleting the old value. */
  reload(...args: T): void;

  /** Clear cache. */
  clear(): void;
}

type ICachePrimitiveKey = string | number | undefined;
type ICacheKeyTuple = [cacheGroup: string, cacheKey: string];

export interface ICacheOptions<T extends unknown[]> {
  /**
   * Convert args into `cacheGroup` and `cacheKey`.
   * If `cacheKey` is not provided, `cacheGroup` will be used.
   * By default the args are ignored and the function is only evaluated once.
   *
   * Each `cacheGroup` stores a cached value, `cacheKey` determines whether the value is stale and needs to be reloaded.
   *
   * @returns `cacheGroup` or `[cacheGroup, cacheKey]`.
   */
  resolver: (
    ...args: T
  ) => ICachePrimitiveKey | [cacheGroup: ICachePrimitiveKey, cacheKey: ICachePrimitiveKey];
  /**
   * Whether stale value should be returned.
   */
  mustRevalidate: boolean;
  /**
   * Time to live, -1 for always. Default as `-1`.
   */
  ttl: number;
}

interface ICacheData<U = unknown> {
  key: string;
  promise: Promise<U>;
  settled: boolean;
  value?: U;
  expireAt: number;
}

const defaultOptions: ICacheOptions<unknown[]> = {
  mustRevalidate: false,
  resolver: () => '',
  ttl: -1,
};

export const cacheAsyncFactory = <T extends unknown[], U>(
  cacheFactory: () => { value: Record<string, ICacheData<U> | undefined> },
) => {
  const cachedFns: ICachedFunction<any, any>[] = [];
  const cacheAsync = (
    fn: (...args: T) => Promise<U>,
    options?: Partial<ICacheOptions<T>>,
  ): ICachedFunction<T, U> => {
    const cache = cacheFactory();
    const { mustRevalidate, resolver, ttl }: ICacheOptions<T> = {
      ...defaultOptions,
      ...options,
    };
    const resolveKey = (...args: T): ICacheKeyTuple => {
      const res = resolver(...args);
      const keys = Array.isArray(res) ? res : ([res, res] as ICacheKeyTuple);
      return keys.map((key) => `${key ?? ''}`) as ICacheKeyTuple;
    };
    const isFresh = (
      cacheKey: string,
      cachedData: ICacheData<U> | undefined,
    ) => {
      return (
        cachedData?.key === cacheKey &&
        cachedData.settled &&
        (cachedData.expireAt < 0 || cachedData.expireAt > Date.now())
      );
    };
    const get = (...args: T) => {
      const [cacheGroup, cacheKey] = resolveKey(...args);
      const cachedData = cache.value[cacheGroup];
      if (cachedData && (!mustRevalidate || isFresh(cacheKey, cachedData))) {
        return cachedData.value;
      }
    };
    const delete_ = (...args: T) => {
      const [cacheGroup] = resolveKey(...args);
      const newCache = { ...cache.value };
      delete newCache[cacheGroup];
      cache.value = newCache;
    };
    const clear = () => {
      cache.value = {};
    };
    const reload = (...args: T) => {
      const [cacheGroup, cacheKey] = resolveKey(...args);
      const oldCache = cache.value[cacheGroup];
      const promise = fn(...args);
      const cachedData: ICacheData<U> = {
        ...oldCache,
        key: cacheKey,
        promise,
        // Set to -1 until the promise is either resolved or rejected
        expireAt: -1,
        settled: false,
      };
      cache.value = {
        ...cache.value,
        [cacheGroup]: cachedData,
      };
      const resolve = (error: boolean, value?: U) => {
        if (cache.value[cacheGroup] !== cachedData) {
          // cache has been updated, ignore invalidated data
          return;
        }
        let expireAt: number;
        if (error) {
          expireAt = 0;
        } else {
          expireAt = ttl < 0 ? ttl : Date.now() + ttl;
        }
        cache.value = {
          ...cache.value,
          [cacheGroup]: {
            ...cachedData,
            value,
            expireAt,
            settled: true,
          },
        };
      };
      promise.then(
        (value) => {
          resolve(false, value);
        },
        () => {
          resolve(true);
        },
      );
      return promise;
    };
    const cachedFn: ICachedFunction<T, U> = Object.assign(
      (...args: T) => {
        const [cacheGroup, cacheKey] = resolveKey(...args);
        const cachedData = cache.value[cacheGroup];
        if (cachedData && isFresh(cacheKey, cachedData)) {
          return cachedData.promise;
        }
        return reload(...args);
      },
      { get, delete: delete_, reload, clear },
    );
    cachedFns.push(cachedFn);
    return cachedFn;
  };
  const clearCache = () => cachedFns.forEach((fn) => fn.clear());
  return { cacheAsync, getAll: () => cachedFns, clearCache };
};
