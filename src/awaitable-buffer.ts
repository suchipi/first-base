import Defer from "@suchipi/defer";
import stripAnsi from "strip-ansi";

export type AwaitableBufferRequest = {
  value: string | RegExp;
  resolve: () => void;
  reject: (error: Error) => void;
};

export class AwaitableBuffer {
  private _content: string = "";
  private _requests = new Set<AwaitableBufferRequest>();

  request(value: string | RegExp): Promise<void> {
    const defer = new Defer<void>();
    const request: AwaitableBufferRequest = {
      value,
      resolve: () => {
        this._requests.delete(request);
        defer.resolve();
      },
      reject: (error: Error) => {
        this._requests.delete(request);
        defer.reject(error);
      },
    };
    this._requests.add(request);
    this._check();
    return defer.promise;
  }

  addContent(data: string) {
    this._content += data;
    this._check();
  }

  private _check() {
    for (const request of this._requests) {
      if (typeof request.value === "string") {
        if (stripAnsi(this._content).indexOf(request.value) != -1) {
          request.resolve();
        }
      } else if (request.value instanceof RegExp) {
        if (request.value.test(stripAnsi(this._content))) {
          request.resolve();
        }
      }
    }
  }

  clearContent() {
    this._content = "";
  }

  cancelRequests(errorMaker: (request: AwaitableBufferRequest) => Error) {
    for (const request of this._requests) {
      request.reject(errorMaker(request));
    }
  }
}
