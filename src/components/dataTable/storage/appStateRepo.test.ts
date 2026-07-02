import { describe, expect, it } from "vitest";
import { createDefaultAppState } from "../domain/factory";
import {
  createBrowserAppStateRepository,
  createMemoryAppStateRepository,
} from "./appStateRepo";

describe("createMemoryAppStateRepository", () => {
  it("returns undefined when standalone data table state is empty", async () => {
    const repository = createMemoryAppStateRepository();

    await expect(repository.loadAppState()).resolves.toBeUndefined();
  });

  it("saves and loads standalone data table state", async () => {
    const repository = createMemoryAppStateRepository();
    const state = createDefaultAppState();

    await repository.saveAppState(state);

    await expect(repository.loadAppState()).resolves.toEqual(state);
  });

  it("clears standalone data table state", async () => {
    const repository = createMemoryAppStateRepository();

    await repository.saveAppState(createDefaultAppState());
    await repository.clearAppState();

    await expect(repository.loadAppState()).resolves.toBeUndefined();
  });
});

describe("createBrowserAppStateRepository", () => {
  it("stores standalone data table state under the zhixi key", async () => {
    window.localStorage.clear();
    const repository = createBrowserAppStateRepository();
    const state = createDefaultAppState();

    await repository.saveAppState(state);

    expect(window.localStorage.getItem("zhixi.standalone-data-table-state.v1")).toBe(
      JSON.stringify(state),
    );
    const storageKeys = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index),
    );
    expect(storageKeys).toEqual(["zhixi.standalone-data-table-state.v1"]);
  });
});
