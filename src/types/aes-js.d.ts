declare module 'aes-js' {
  export class Counter {
    constructor(initialValue: number | ArrayLike<number>);
  }
  export const ModeOfOperation: {
    ctr: new (key: ArrayLike<number>, counter: Counter) => {
      encrypt(bytes: ArrayLike<number>): Uint8Array;
      decrypt(bytes: ArrayLike<number>): Uint8Array;
    };
  };
  export const utils: {
    hex: { toBytes(hex: string): Uint8Array; fromBytes(bytes: ArrayLike<number>): string };
    utf8: { toBytes(text: string): Uint8Array; fromBytes(bytes: ArrayLike<number>): string };
  };
  const aesjs: { Counter: typeof Counter; ModeOfOperation: typeof ModeOfOperation; utils: typeof utils };
  export default aesjs;
}
