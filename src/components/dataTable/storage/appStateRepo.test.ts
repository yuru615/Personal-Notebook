import { describe, expect, it } from "vitest";
import { createDefaultAppState } from "../domain/factory";
import { createMemoryAppStateRepository } from "./appStateRepo";

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
