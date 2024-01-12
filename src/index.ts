export interface ICachedFunction<T extends unknown[], U> {
  (...args: T): Promise<U>;

  /** Return the currently cached value immediately. */
  get(...args: T): U | undefined;

  /** Delete the currently cached value. */
  delete(...args: T): void;

  /** Invalidate the current cached value and send a new request without deleting the old value. */
  reload(...args: T): void;

  /** Whether the latest request is settled. */
  isSettled(...args: T): boolean;

  /** Whether the value returned by `get` is fresh. */
  isFresh(...args: T): boolean;

  /** Clear cache. */
  clear(): void;

  /** The cache storage, only used for testing purpose. */
  cache: ICacheStorage<U>;
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
  ) =>
    | ICachePrimitiveKey
    | [cacheGroup: ICachePrimitiveKey, cacheKey: ICachePrimitiveKey];
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

export interface ICacheStorage<U> {
  get(cacheGroup: string): ICacheData<U> | undefined;
  set(cacheGroup: string, data?: ICacheData<U>): void;
  clear(): void;
}

export const cacheAsyncFactory = (cacheFactory: <U>() => ICacheStorage<U>) => {
  const cachedFns: ICachedFunction<any, any>[] = [];
  const cacheAsync = <T extends unknown[], U>(
    fn: (...args: T) => Promise<U>,
    options?: Partial<ICacheOptions<T>>,
  ): ICachedFunction<T, U> => {
    const cache = cacheFactory<U>();
    const { mustRevalidate, resolver, ttl }: ICacheOptions<T> = {
      ...defaultOptions,
      ...options,
    };
    const resolveKey = (...args: T): ICacheKeyTuple => {
      const res = resolver(...args);
      const keys = Array.isArray(res) ? res : ([res, res] as ICacheKeyTuple);
      return keys.map((key) => `${key ?? ''}`) as ICacheKeyTuple;
    };
    const withArgs = <V>(keyFn: (keys: ICacheKeyTuple, args: T) => V) => {
      return (...args: T) => {
        const keys = resolveKey(...args);
        return keyFn(keys, args);
      };
    };
    const isSettled = ([cacheGroup, cacheKey]: ICacheKeyTuple) => {
      const cachedData = cache.get(cacheGroup);
      return cachedData?.key === cacheKey && cachedData.settled;
    };
    const isFresh = ([cacheGroup, cacheKey]: ICacheKeyTuple) => {
      const cachedData = cache.get(cacheGroup);
      return (
        cachedData?.key === cacheKey &&
        cachedData.settled &&
        (cachedData.expireAt < 0 || cachedData.expireAt > Date.now())
      );
    };
    const get = ([cacheGroup, cacheKey]: ICacheKeyTuple) => {
      const cachedData = cache.get(cacheGroup);
      if (cachedData && (!mustRevalidate || isFresh([cacheGroup, cacheKey]))) {
        return cachedData.value;
      }
    };
    const delete_ = ([cacheGroup]: ICacheKeyTuple) => {
      cache.set(cacheGroup);
    };
    const clear = () => {
      cache.clear();
    };
    const reload = ([cacheGroup, cacheKey]: ICacheKeyTuple, args: T) => {
      const oldCache = cache.get(cacheGroup);
      const promise = fn(...args);
      const cachedData: ICacheData<U> = {
        ...oldCache,
        key: cacheKey,
        promise,
        // Set to -1 until the promise is either resolved or rejected
        expireAt: -1,
        settled: false,
      };
      cache.set(cacheGroup, cachedData);
      const resolve = (error: boolean, value?: U) => {
        if (cache.get(cacheGroup) !== cachedData) {
          // cache has been updated, ignore invalidated data
          return;
        }
        let expireAt: number;
        if (error) {
          expireAt = 0;
        } else {
          expireAt = ttl < 0 ? ttl : Date.now() + ttl;
        }
        cache.set(cacheGroup, {
          ...cachedData,
          value,
          expireAt,
          settled: true,
        });
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
      withArgs(([cacheGroup, cacheKey], args) => {
        const cachedData = cache.get(cacheGroup);
        if (cachedData && isFresh([cacheGroup, cacheKey])) {
          return cachedData.promise;
        }
        return reload([cacheGroup, cacheKey], args);
      }),
      {
        get: withArgs(get),
        delete: withArgs(delete_),
        reload: withArgs(reload),
        isSettled: withArgs(isSettled),
        isFresh: withArgs(isFresh),
        clear,
        cache,
      },
    );
    cachedFns.push(cachedFn);
    return cachedFn;
  };
  const clearCache = () => cachedFns.forEach((fn) => fn.clear());
  return { cacheAsync, getAll: () => cachedFns, clearCache };
};
