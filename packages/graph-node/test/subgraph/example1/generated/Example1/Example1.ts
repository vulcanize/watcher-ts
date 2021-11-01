// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  ethereum,
  JSONValue,
  TypedMap,
  Entity,
  Bytes,
  Address,
  BigInt
} from "@graphprotocol/graph-ts";

export class Test extends ethereum.Event {
  get params(): Test__Params {
    return new Test__Params(this);
  }
}

export class Test__Params {
  _event: Test;

  constructor(event: Test) {
    this._event = event;
  }

  get param1(): string {
    return this._event.parameters[0].value.toString();
  }

  get param2(): i32 {
    return this._event.parameters[1].value.toI32();
  }
}

export class Example1 extends ethereum.SmartContract {
  static bind(address: Address): Example1 {
    return new Example1("Example1", address);
  }

  emitEvent(): boolean {
    let result = super.call("emitEvent", "emitEvent():(bool)", []);

    return result[0].toBoolean();
  }

  try_emitEvent(): ethereum.CallResult<boolean> {
    let result = super.tryCall("emitEvent", "emitEvent():(bool)", []);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBoolean());
  }

  getMethod(): string {
    let result = super.call("getMethod", "getMethod():(string)", []);

    return result[0].toString();
  }

  try_getMethod(): ethereum.CallResult<string> {
    let result = super.tryCall("getMethod", "getMethod():(string)", []);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toString());
  }
}

export class EmitEventCall extends ethereum.Call {
  get inputs(): EmitEventCall__Inputs {
    return new EmitEventCall__Inputs(this);
  }

  get outputs(): EmitEventCall__Outputs {
    return new EmitEventCall__Outputs(this);
  }
}

export class EmitEventCall__Inputs {
  _call: EmitEventCall;

  constructor(call: EmitEventCall) {
    this._call = call;
  }
}

export class EmitEventCall__Outputs {
  _call: EmitEventCall;

  constructor(call: EmitEventCall) {
    this._call = call;
  }

  get value0(): boolean {
    return this._call.outputValues[0].value.toBoolean();
  }
}
