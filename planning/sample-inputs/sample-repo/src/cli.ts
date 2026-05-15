import { CacheService, fib } from './index';

const svc = new CacheService();
svc.push({ key: 'a', bytes: fib(20) });
console.log('total bytes', svc.total());
