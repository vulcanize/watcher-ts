// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  TypedMap,
  Entity,
  Value,
  ValueKind,
  store,
  Address,
  Bytes,
  BigInt,
  BigDecimal
} from "@graphprotocol/graph-ts";

export class RelatedEntity extends Entity {
  constructor(id: string) {
    super();
    this.set("id", Value.fromString(id));

    this.set("paramBigInt", Value.fromBigInt(BigInt.zero()));
  }

  save(): void {
    let id = this.get("id");
    assert(id != null, "Cannot save RelatedEntity entity without an ID");
    if (id) {
      assert(
        id.kind == ValueKind.STRING,
        "Cannot save RelatedEntity entity with non-string ID. " +
          'Considering using .toHex() to convert the "id" to a string.'
      );
      store.set("RelatedEntity", id.toString(), this);
    }
  }

  static load(id: string): RelatedEntity | null {
    return changetype<RelatedEntity | null>(store.get("RelatedEntity", id));
  }

  get id(): string {
    let value = this.get("id");
    return value!.toString();
  }

  set id(value: string) {
    this.set("id", Value.fromString(value));
  }

  get paramBigInt(): BigInt {
    let value = this.get("paramBigInt");
    return value!.toBigInt();
  }

  set paramBigInt(value: BigInt) {
    this.set("paramBigInt", Value.fromBigInt(value));
  }
}

export class ExampleEntity extends Entity {
  constructor(id: string) {
    super();
    this.set("id", Value.fromString(id));

    this.set("count", Value.fromBigInt(BigInt.zero()));
    this.set("paramString", Value.fromString(""));
    this.set("paramInt", Value.fromI32(0));
    this.set("paramBoolean", Value.fromBoolean(false));
    this.set("paramBytes", Value.fromBytes(Bytes.empty()));
    this.set("paramEnum", Value.fromString(""));
    this.set("paramBigDecimal", Value.fromBigDecimal(BigDecimal.zero()));
    this.set("related", Value.fromString(""));
  }

  save(): void {
    let id = this.get("id");
    assert(id != null, "Cannot save ExampleEntity entity without an ID");
    if (id) {
      assert(
        id.kind == ValueKind.STRING,
        "Cannot save ExampleEntity entity with non-string ID. " +
          'Considering using .toHex() to convert the "id" to a string.'
      );
      store.set("ExampleEntity", id.toString(), this);
    }
  }

  static load(id: string): ExampleEntity | null {
    return changetype<ExampleEntity | null>(store.get("ExampleEntity", id));
  }

  get id(): string {
    let value = this.get("id");
    return value!.toString();
  }

  set id(value: string) {
    this.set("id", Value.fromString(value));
  }

  get count(): BigInt {
    let value = this.get("count");
    return value!.toBigInt();
  }

  set count(value: BigInt) {
    this.set("count", Value.fromBigInt(value));
  }

  get paramString(): string {
    let value = this.get("paramString");
    return value!.toString();
  }

  set paramString(value: string) {
    this.set("paramString", Value.fromString(value));
  }

  get paramInt(): i32 {
    let value = this.get("paramInt");
    return value!.toI32();
  }

  set paramInt(value: i32) {
    this.set("paramInt", Value.fromI32(value));
  }

  get paramBoolean(): boolean {
    let value = this.get("paramBoolean");
    return value!.toBoolean();
  }

  set paramBoolean(value: boolean) {
    this.set("paramBoolean", Value.fromBoolean(value));
  }

  get paramBytes(): Bytes {
    let value = this.get("paramBytes");
    return value!.toBytes();
  }

  set paramBytes(value: Bytes) {
    this.set("paramBytes", Value.fromBytes(value));
  }

  get paramEnum(): string {
    let value = this.get("paramEnum");
    return value!.toString();
  }

  set paramEnum(value: string) {
    this.set("paramEnum", Value.fromString(value));
  }

  get paramBigDecimal(): BigDecimal {
    let value = this.get("paramBigDecimal");
    return value!.toBigDecimal();
  }

  set paramBigDecimal(value: BigDecimal) {
    this.set("paramBigDecimal", Value.fromBigDecimal(value));
  }

  get related(): string {
    let value = this.get("related");
    return value!.toString();
  }

  set related(value: string) {
    this.set("related", Value.fromString(value));
  }
}
