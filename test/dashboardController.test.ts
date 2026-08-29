import assert from "node:assert/strict";
import test from "node:test";
import { DashboardController, type DashboardSelection } from "../src/ui/dashboard";

function makeController() {
  const orchestrator = {
    subscribe() { return () => undefined; },
  };
  return new DashboardController("resource://scholar-assistant/", orchestrator as any);
}

const firstSelection: DashboardSelection = {
  path: "C:\\papers\\abc.csv",
  papers: [{ row: 2, title: "First paper" }],
  collectionName: "abc",
};

test("dashboard opens non-modally and exposes the selected CSV to its window", () => {
  const controller = makeController();
  let features = "";
  const dialog = { closed: false, focus() {} };
  const parent = {
    openDialog(_url: string, _name: string, suppliedFeatures: string) {
      features = suppliedFeatures;
      return dialog;
    },
  };

  controller.open(parent as any, firstSelection);

  assert.match(features, /dialog=no/);
  assert.match(features, /dependent=no/);
  assert.deepEqual(controller.consumePreparedSelection(), firstSelection);
  assert.equal(controller.consumePreparedSelection(), null);
});

test("an already-open dashboard receives a new CSV selection directly", () => {
  const controller = makeController();
  let loaded: DashboardSelection | null = null;
  let focused = false;
  const dialog = {
    closed: false,
    focus() { focused = true; },
    ScholarAssistantDashboard: {
      loadSelection(selection: DashboardSelection) { loaded = selection; },
    },
  };
  const parent = { openDialog() { return dialog; } };

  controller.open(parent as any);
  controller.open(parent as any, firstSelection);

  assert.deepEqual(loaded, firstSelection);
  assert.equal(focused, true);
  assert.equal(controller.consumePreparedSelection(), null);
});
