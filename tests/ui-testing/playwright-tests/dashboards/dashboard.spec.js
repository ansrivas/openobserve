import { test, expect } from "../baseFixtures";
import logData from "../../cypress/fixtures/log.json";
import logsdata from "../../../test-data/logs_data.json";
import { waitForDateTimeButtonToBeEnabled } from "./dashboard.utils";

const randomDashboardName =
  "Dashboard_" + Math.random().toString(36).substr(2, 9);

test.describe.configure({ mode: "parallel" });

async function login(page) {
  await page.goto(process.env["ZO_BASE_URL"], { waitUntil: "networkidle" });

  if (await page.getByText("Login as internal user").isVisible()) {
    await page.getByText("Login as internal user").click();
  }

  await page.waitForTimeout(1000);
  await page
    .locator('[data-cy="login-user-id"]')
    .fill(process.env["ZO_ROOT_USER_EMAIL"]);

  // wait for login api response
  const waitForLogin = page.waitForResponse(
    (response) =>
      response.url().includes("/auth/login") && response.status() === 200
  );

  await page
    .locator('[data-cy="login-password"]')
    .fill(process.env["ZO_ROOT_USER_PASSWORD"]);
  await page.locator('[data-cy="login-sign-in"]').click();

  await waitForLogin;

  await page.waitForURL(process.env["ZO_BASE_URL"] + "/web/", {
    waitUntil: "networkidle",
  });
  await page
    .locator('[data-test="navbar-organizations-select"]')
    .getByText("arrow_drop_down")
    .click();
  await page.getByRole("option", { name: "default", exact: true }).click();
}

async function ingestion(page) {
  const orgId = process.env["ORGNAME"];
  const streamName = "e2e_automate";
  const basicAuthCredentials = Buffer.from(
    `${process.env["ZO_ROOT_USER_EMAIL"]}:${process.env["ZO_ROOT_USER_PASSWORD"]}`
  ).toString("base64");

  const headers = {
    Authorization: `Basic ${basicAuthCredentials}`,
    "Content-Type": "application/json",
  };
  const fetchResponse = await fetch(
    `${process.env.INGESTION_URL}/api/${orgId}/${streamName}/_json`,
    {
      method: "POST",
      headers: headers,
      body: JSON.stringify(logsdata),
    }
  );
  const response = await fetchResponse.json();
  console.log(response);
}

async function waitForDashboardPage(page) {
  const dashboardListApi = page.waitForResponse(
    (response) =>
      /\/api\/.+\/dashboards/.test(response.url()) && response.status() === 200
  );

  await page.waitForURL(process.env["ZO_BASE_URL"] + "/web/dashboards**");

  await page.waitForSelector(`text="Please wait while loading dashboards..."`, {
    state: "hidden",
  });
  await dashboardListApi;
  await page.waitForTimeout(500);
}

test.describe("dashboard UI testcases", () => {
  // let logData;
  function removeUTFCharacters(text) {
    // console.log(text, "tex");
    // Remove UTF characters using regular expression
    return text.replace(/[^\x00-\x7F]/g, " ");
  }
  async function applyQueryButton(page) {
    // click on the run query button
    // Type the value of a variable into an input field
    const search = page.waitForResponse(logData.applyQuery);
    await page.waitForTimeout(3000);
    await page.locator("[data-test='logs-search-bar-refresh-btn']").click({
      force: true,
    });
    // get the data from the search variable
    await expect.poll(async () => (await search).status()).toBe(200);
    // await search.hits.FIXME_should("be.an", "array");
  }
  // tebefore(async function () {
  //   // logData("log");
  //   // const data = page;
  //   // logData = data;

  //   console.log("--logData--", logData);
  // });
  test.beforeEach(async ({ page }) => {
    console.log("running before each");
    await login(page);
    await page.waitForTimeout(1000);
    await ingestion(page);
    await page.waitForTimeout(2000);

    // just to make sure org is set
    const orgNavigation = page.goto(
      `${logData.logsUrl}?org_identifier=${process.env["ORGNAME"]}`
    );

    await orgNavigation;
  });

  test("should add and delete the dashboard", async ({ page }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();
    await page.locator('[data-test="dashboard-back-btn"]').click();

    await expect(
      page
        .getByRole("row", { name: `01 ${randomDashboardName}` })
        .locator('[data-test="dashboard-delete"]')
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("row", { name: `01 ${randomDashboardName}` })
      .locator('[data-test="dashboard-delete"]')
      .click();
    await page.locator('[data-test="confirm-button"]').click();
  });

  test("should create a duplicate of the dashboard", async ({ page }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();
    await expect(page.getByText("Dashboard added successfully.")).toBeVisible({
      timeout: 30000,
    });

    await page.locator('[data-test="dashboard-back-btn"]').click();

    await expect(
      page
        .getByRole("row", { name: `01 ${randomDashboardName}` })
        .locator('[data-test="dashboard-duplicate"]')
    ).toBeVisible();
    await page
      .getByRole("row", { name: `01 ${randomDashboardName}` })
      .locator('[data-test="dashboard-duplicate"]')
      .click();
  });

  test("should create a dashboard and add the breakdown", async ({ page }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();
    await expect(page.getByText("Dashboard added successfully.")).toBeVisible({
      timeout: 3000,
    });
    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();

    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();

    // Refine the locator for 'e2e_automate'
    await page
      .locator("span")
      .filter({ hasText: /^e2e_automate$/ })
      .click();

    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_image"] [data-test="dashboard-add-b-data"]'
      )
      .click();

    await expect(page.locator('[data-test="dashboard-apply"]')).toBeVisible();
    await page.locator('[data-test="dashboard-apply"]').click();
  });

  test("should update the data when changing the time between both absolute and relative time using the Kolkata time zone.", async ({
    page,
  }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page.getByRole("option", { name: "e2e_automate" }).click();

    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_image"] [data-test="dashboard-add-b-data"]'
      )
      .click();

    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-3-h-btn"]').click();
    await page
      .locator("label")
      .filter({ hasText: "Timezonearrow_drop_down" })
      .locator("i")
      .click();
    await page.locator('[data-test="datetime-timezone-select"]').click();

    await page.locator('[data-test="datetime-timezone-select"]').press("Enter");
    await page
      .locator('[data-test="datetime-timezone-select"]')
      .fill("calcutta");
    await page.getByText("Asia/Calcutta", { exact: true }).click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(300);

    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-absolute-tab"]').click();
    await page
      .locator("button")
      .filter({ hasText: "chevron_left" })
      .first()
      .click();

    await page.getByRole("button", { name: "7" }).last().click();
    await page.getByRole("button", { name: "8" }).last().click();

    await page.locator('[data-test="dashboard-apply"]').click();
  });

  test("should update the chart with the results of a custom SQL query", async ({
    page,
  }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator('[data-test="dashboard-x-item-_timestamp-remove"]')
      .click();
    await page.locator('[data-test="dashboard-customSql"]').click();

    // Focus on the first line of the editor
    await page.locator(".cm-line").first().click();
    await page
      .locator('[data-test="dashboard-panel-query-editor"]')
      .getByRole("textbox")
      .click();
    await page
      .locator('[data-test="dashboard-panel-query-editor"]')
      .locator(".cm-content")
      .fill(
        'SELECT histogram(_timestamp) as "x_axis_1", count(_timestamp) as "y_axis_1", kubernetes_container_name as "breakdown_1" FROM "e2e_automate" GROUP BY x_axis_1, breakdown_1'
      );

    // Fill the custom SQL query
    // await page.keyboard.type(
    //   'SELECT histogram(_timestamp) as "x_axis_1", count(_timestamp) as "y_axis_1", kubernetes_container_name as "breakdown_1" FROM "e2e_automate" GROUP BY x_axis_1, breakdown_1'
    // );
    await page.waitForTimeout(400);

    await page.locator('[data-test="dashboard-apply"]').click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-x_axis_1"] [data-test="dashboard-add-x-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-y_axis_1"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-breakdown_1"] [data-test="dashboard-add-b-data"]'
      )
      .click();

    await page.waitForTimeout(200);

    await page.locator('[data-test="dashboard-apply"]'); //.toBeVisible();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-30-m-btn"]').click();
    await page.locator('[data-test="date-time-relative-3-h-btn"]').click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(400);
    await expect(
      page.locator('[data-test="dashboard-panel-name"]')
    ).toBeVisible();
    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page
      .locator('[data-test="dashboard-panel-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-panel-save"]').click();
  });

  test("should display the correct and updated chart when changing the chart type", async ({
    page,
  }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page.getByRole("option", { name: "e2e_automate" }).click();

    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_image"] [data-test="dashboard-add-b-data"]'
      )
      .click();

    //  await page.locator('[data-test="field-list-item-logs-e2e_automate-kubernetes_docker_id"] [data-test="dashboard-add-y-data"]').click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-3-w-btn"]').click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(200);

    await page.locator('[data-test="selected-chart-area-item"]').click();

    await expect(
      page.locator('[data-test="selected-chart-area-stacked-item"]')
    ).toBeVisible();

    await page.locator('[data-test="selected-chart-h-bar-item"] img').click();
    await expect(
      page.locator('[data-test="selected-chart-scatter-item"] img')
    ).toBeVisible();

    await page.locator('[data-test="selected-chart-scatter-item"] img').click();
    await expect(
      page.locator('[data-test="selected-chart-gauge-item"] img')
    ).toBeVisible();

    await page.locator('[data-test="selected-chart-gauge-item"] img').click();
    await expect(
      page.locator('[data-test="dashboard-panel-name"]')
    ).toBeVisible();

    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page.locator('[data-test="dashboard-panel-name"]').fill("Dash_01");
    await page.locator('[data-test="dashboard-panel-save"]').click();
    await page.waitForTimeout(200);
    await page
      .locator('[data-test="dashboard-edit-panel-Dash_01-dropdown"]')
      .click();
    await page.locator('[data-test="dashboard-delete-panel"]').click();
    await page.locator('[data-test="confirm-button"]').click();
  });

  test("should navigate to another dashboard using the DrillDown feature.", async ({
    page,
  }) => {
    // Folder select as a " Default"vfrom this test cases

    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);

    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page.getByRole("option", { name: "e2e_automate" }).click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_labels_app_kubernetes_io_component"] [data-test="dashboard-add-b-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_labels_app_kubernetes_io_instance"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_labels_app_kubernetes_io_managed_by"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-5-w-btn"]').click();

    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(200);

    await page.locator('[data-test="dashboard-sidebar"]').click();
    await page
      .locator('[data-test="dashboard-addpanel-config-drilldown-add-btn"]')
      .click();
    await page
      .locator('[data-test="dashboard-config-panel-drilldown-name"]')
      .click();
    await page
      .locator('[data-test="dashboard-config-panel-drilldown-name"]')
      .fill("Dashboard1");
    await page
      .locator('[data-test="dashboard-drilldown-folder-select"]')
      .click();

    await page
      .getByRole("option", { name: "default" })
      .locator("div")
      .nth(2)
      .click();
    await page.getByPlaceholder("Name").nth(1).click();
    await page.getByPlaceholder("Name").nth(1).fill("Dash");
    await page.locator('[data-test="confirm-button"]').click();

    await expect(
      page.locator('[data-test="dashboard-addpanel-config-drilldown-name-0"]')
    ).toBeVisible();
    await page.locator('[data-test="dashboard-apply"]').click();
    //   await expect(page.locator('[data-test="chart-renderer"] canvas')).toBeVisible();
    // await page.locator('[data-test="chart-renderer"] canvas').click({
    //     position: {
    //         x: 371,
    //         y: 109
    //     }
    // });
    // page.once('dialog', dialog => {
    //     console.log(`Dialog message: ${dialog.message()}`);
    //     dialog.dismiss().catch(() => { });
    // });

    // await page.getByText('Dashboard1').click();               //getByText
    // await page.waitForTimeout(3000);
    // await page.locator('[data-test="dashboard-back-btn"]').click();
    // await page.getByRole('cell', { name: 'hjkhjk' }).click();
  });

  test.skip("should create the specified URL using the DrillDown feature", async ({
    page,
  }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);

    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page.waitForTimeout(200);

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page
      .getByRole("option", { name: "e2e_automate" })
      .locator("div")
      .nth(2)
      .click();
    ``;
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubectl_kubernetes_io_default_container"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubernetes_io_psp"] [data-test="dashboard-add-b-data"]'
      )
      .click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-4-w-btn"]').click();
    await page
      .locator("label")
      .filter({ hasText: "Timezonearrow_drop_down" })
      .locator("i")
      .click();
    await page
      .getByRole("option", { name: "Asia/Gaza" })
      .locator("div")
      .nth(2)
      .click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(200);

    await expect(
      page.locator('[data-test="chart-renderer"] canvas')
    ).toBeVisible();
    await page.locator('[data-test="dashboard-sidebar"]').click();
    await page
      .locator("label")
      .filter({ hasText: "DefaultUnitarrow_drop_down" })
      .locator("i")
      .click();
    await page
      .getByRole("option", { name: "Bytes", exact: true })
      .locator("div")
      .nth(2)
      .click();

    await page
      .locator('[data-test="dashboard-addpanel-config-drilldown-add-btn"]')
      .click();
    await page.locator('[data-test="dashboard-drilldown-by-url-btn"]').click();
    await page
      .locator('[data-test="dashboard-config-panel-drilldown-name"]')
      .click();
    await page
      .locator('[data-test="dashboard-config-panel-drilldown-name"]')
      .fill("Test");
    await page
      .locator('[data-test="dashboard-drilldown-url-textarea"]')
      .click();
    await page
      .locator('[data-test="dashboard-drilldown-url-textarea"]')
      .fill(
        `${ZO_BASE_URL}/web/dashboards/add_panel?dashboard=7208792649849905562&panelId=Panel_ID4468610&folder=7206186521999716065&tab=default`
      );

    await page
      .locator('[data-test="dashboard-drilldown-open-in-new-tab"] div')
      .nth(2)
      .click();
    await page.locator('[data-test="confirm-button"]').click();

    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(100);

    await page.locator('[data-test="dashboard-sidebar-collapse-btn"]').click();
    await page.locator('[data-test="chart-renderer"] canvas').click({
      position: {
        x: 486,
        y: 88,
      },
    });
    const page1Promise = page.waitForEvent("popup");
    await page.getByText("Test").click(); //Testttt
    const page1 = await page1Promise;
    await expect(
      page1.locator('[data-test="chart-renderer"] canvas')
    ).toBeVisible();
  });

  test.skip("should display a confirmation popup message for unsaved changes when clicking the Discard button", async ({
    page,
  }) => {
    //Excepted : popup massge appear and redirect to the All Dasboarrd page.

    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page.getByRole("option", { name: "e2e_automate" }).click();

    //  await page.locator('[data-test="field-list-item-logs-e2e_automate-_timestamp"] [data-test="dashboard-add-x-data"]').click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubernetes_io_psp"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-b-data"]'
      )
      .click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-5-w-btn"]').click();
    await page
      .locator("label")
      .filter({ hasText: "Timezonearrow_drop_down" })
      .locator("i")
      .click();
    await page.locator('[data-test="datetime-timezone-select"]').click();
    await page
      .locator('[data-test="datetime-timezone-select"]')
      .fill("calcutta");
    await page.waitForTimeout(100);
    await page.getByText("Asia/Calcutta", { exact: true }).click();
    await page.locator('[data-test="dashboard-apply"]').click();

    await expect(
      page.locator('[data-test="chart-renderer"] canvas')
    ).toBeVisible({ timeout: 30000 });

    await page.goto(
      `${ZO_BASE_URL}/web/dashboards/add_panel?dashboard=7216685250963839834&folder=default&tab=default`
    );

    await page.goto(
      `${ZO_BASE_URL}/web/dashboards/view?org_identifier=default&dashboard=7216685250963839834&folder=default&tab=default`
    );

    await page.goto(
      `${ZO_BASE_URL}/web/dashboards/view?org_identifier=default&dashboard=7216685250963839834&folder=default&tab=default&refresh=Off&period=15m&var-Dynamic+filters=%255B%255D&print=false`
    );

    //  await expect(page.getByText('Defaultchevron_leftchevron_rightadd')).toBeVisible({ timeout: 30000 });
  });

  test("should dynamically update the filtered data when applying the dynamic filter on the dashboard", async ({
    page,
  }) => {
    // Excepted :  The dynamic filter should work correctly and display the appropriate data on the dashboard.

    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page.getByRole("option", { name: "e2e_automate" }).click();

    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubernetes_io_psp"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-b-data"]'
      )
      .click();

    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-6-w-btn"]').click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(100);

    await page
      .locator('[data-test="dashboard-variable-adhoc-add-selector"]')
      .click();
    await page
      .locator('[data-test="dashboard-variable-adhoc-name-selector"]')
      .click();
    await page
      .locator('[data-test="dashboard-variable-adhoc-name-selector"]')
      .fill("kubernetes_container_hash");
    await page
      .locator('[data-test="dashboard-variable-adhoc-value-selector"]')
      .click();
    await page
      .locator('[data-test="dashboard-variable-adhoc-value-selector"]')
      .fill(
        "058694856476.dkr.ecr.us-west-2.amazonaws.com/zinc-cp@sha256:56e216b3d61bd282846e3f6d1bd9cb82f83b90b7e401ad0afc0052aa3f15715c"
      );

    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page.locator('[data-test="dashboard-panel-name"]').fill("Dashboard");
    await page.locator('[data-test="dashboard-panel-save"]').click();

    await page.waitForTimeout(2000);

    await page
      .locator('[data-test="dashboard-edit-panel-Dashboard-dropdown"]')
      .click();
    await page.locator('[data-test="dashboard-edit-panel"]').click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-6-w-btn"]').click();
    await page.locator('[data-test="dashboard-apply"]').click();

    await page.locator('[data-test="dashboard-panel-save"]').click();
    await page
      .locator('[data-test="dashboard-edit-panel-Dashboard-dropdown"]')
      .click();
    await page.waitForTimeout(2000);

    await page.locator('[data-test="dashboard-delete-panel"]').click();
    await expect(
      page.getByText("Are you sure you want to delete this Panel?")
    ).toBeVisible();

    await page.locator('[data-test="confirm-button"]').click();
  });

  test.skip("should create and save the dashboard with different relative times and timezones on both the Gauge and Table charts", async ({
    page,
  }) => {
    // Expected Result: The Dashboard is successfully created and saved with accurate data reflecting the specified relative times and timezones on both the Gauge and Table charts.

    // Navigate to dashboards
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    // Add a new panel
    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();

    // Select gauge chart
    await page.locator('[data-test="selected-chart-gauge-item"] img').click();

    // Select a stream
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();

    // Use more specific locator to click on 'e2e_automate'
    await page.locator('span:has-text("e2e_automate")').click();

    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubernetes_io_psp"] [data-test="dashboard-add-y-data"]'
      )
      .click();

    // Set date-time and timezone
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-6-w-btn"]').click();
    await page
      .locator("label")
      .filter({ hasText: "Timezonearrow_drop_down" })
      .locator("i")
      .click();
    await page.getByText("Asia/Karachi").click();
    await page.locator('[data-test="dashboard-apply"]').click();

    // Verify the gauge chart is visible
    await expect(
      page.locator('[data-test="chart-renderer"] canvas')
    ).toBeVisible();

    // Switch to table chart
    await page.locator('[data-test="selected-chart-table-item"] img').click();

    // Set timezone for the table chart
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page
      .locator("label")
      .filter({ hasText: "Timezonearrow_drop_down" })
      .locator("i")
      .click();
    await page.getByText("Asia/Gaza").click();
    await page.locator('[data-test="dashboard-apply"]').click();

    // Edit the panel name
    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page
      .locator('[data-test="dashboard-panel-name"]')
      .fill("Dashboard_01");
    await page.locator('[data-test="dashboard-panel-save"]').click();

    // Delete the panel
    await page
      .locator('[data-test="dashboard-edit-panel-Dashboard_01-dropdown"]')
      .click();
    await page.locator('[data-test="dashboard-delete-panel"]').click();
    await page.locator('[data-test="confirm-button"]').click();
  });

  test("should have the Date and Time filter, Page Refresh, and Share Link features working correctly on the Dashboard panel page", async ({
    page,
  }) => {
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="add-dashboard-description"]').click();
    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();

    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page.getByRole("option", { name: "e2e_automate" }).click();

    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubernetes_io_psp"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-b-data"]'
      )
      .click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-5-w-btn"]').click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(200);

    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page.locator('[data-test="dashboard-panel-name"]').fill("Dashboard");
    await page.locator('[data-test="dashboard-panel-save"]').click();
    await page.waitForTimeout(200);

    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-5-w-btn"]').click();

    await page.locator('[data-test="dashboard-share-btn"]').click();

    await expect(page.getByText("Link copied successfully")).toBeHidden();

    await page.locator('[data-test="dashboard-fullscreen-btn"]').click();
    await expect(
      page.locator('[data-test="dashboard-fullscreen-btn"]')
    ).toBeVisible();

    await page.locator('[data-test="dashboard-fullscreen-btn"]').click();
  });

  test.skip("should display an error message when some fields are missing or incorrect", async ({
    page,
  }) => {
    // Expected Result: An appropriate error message is displayed if any fields are missing or incorrect.

    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();

    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page
      .getByRole("option", { name: "e2e_automate" })
      .locator("div")
      .nth(2)
      .click();

    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubernetes_io_psp"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-b-data"]'
      )
      .click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-relative-6-w-btn"]').click();
    await page.locator('[data-test="datetime-timezone-select"]').click();

    await page.waitForTimeout(1000);

    await page.getByRole("option", { name: "Asia/Gaza" }).click();

    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(200);

    await page.locator('[data-test="dashboard-panel-save"]').click();

    await expect(
      page.getByText("There are some errors, please fix them and try again")
    ).toBeVisible();

    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page.locator('[data-test="dashboard-panel-name"]').fill("Dash_Error");
    await page.locator('[data-test="dashboard-panel-save"]').click();

    await page.waitForTimeout(200);

    // Delete the panel
    await page
      .locator('[data-test="dashboard-edit-panel-Dash_Error-dropdown"]')
      .click();
    await page.locator('[data-test="dashboard-delete-panel"]').click();
    await page.locator('[data-test="confirm-button"]').click();
  });

  test("should apply various filter operators to the dashboard field and display the correct results", async ({
    page,
  }) => {
    // Navigate to dashboards section
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);

    // Add a new dashboard
    await page.locator('[data-test="dashboard-add"]').click();
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();
    await expect(page.getByText("Dashboard added successfully.")).toHaveText(
      "Dashboard added successfully."
    );

    // Add a new panel and configure it
    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page.getByRole("option", { name: "e2e_automate" }).click();

    // Add panel fields
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_annotations_kubernetes_io_psp"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-b-data"]'
      )
      .click();

    await page.locator('[data-test="date-time-btn"]').click();
    await page.locator('[data-test="date-time-absolute-tab"]').click();
    await page
      .locator("button")
      .filter({ hasText: "chevron_left" })
      .first()
      .click();

    await page.getByRole("button", { name: "7" }).last().click();
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "10" }).last().click();
    await page.locator('[data-test="datetime-timezone-select"]').click();
    await page.locator('[data-test="dashboard-apply"]').click();

    // Apply "Is Null" filter
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_host"] [data-test="dashboard-add-filter-data"]'
      )
      .click();

    await page
      .locator('[data-test="dashboard-add-condition-label-0-kubernetes_host"]')
      .click();
    await page
      .locator('[data-test="dashboard-add-condition-condition-0"]')
      .click();

    await page
      .locator("label")
      .filter({ hasText: "Operatorarrow_drop_down" })
      .locator("i")
      .click();

    await page.getByRole("option", { name: "Is Null" }).click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(200);

    await page
      .locator('[data-test="dashboard-add-condition-label-0-kubernetes_host"]')
      .click();
    await page
      .locator('[data-test="dashboard-add-condition-condition-0"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Operatorarrow_drop_down" })
      .locator("i")
      .click();

    await page.getByRole("option", { name: "=", exact: true }).click();
    await page.getByLabel("Value").click();
    await page.getByLabel("Value").fill("kubernetes_docker_id");
    await page.locator('[data-test="dashboard-apply"]').click();

    // Apply "Is Not Null" filter
    await page.locator('[data-test="no-data"]').click();
    await waitForDateTimeButtonToBeEnabled(page);
    await page.locator('[data-test="date-time-btn"]').click();

    await page.locator('[data-test="date-time-relative-tab"]').click();
    await page.locator('[data-test="date-time-relative-6-w-btn"]').click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(100);

    await page
      .locator('[data-test="dashboard-add-condition-label-0-kubernetes_host"]')
      .click();
    await page
      .locator('[data-test="dashboard-add-condition-condition-0"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Operatorarrow_drop_down" })
      .locator("i")
      .click();

    await page.getByText("Is Not Null").click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.waitForTimeout(100);

    //   Apply "<>" filter
    //  await page.locator('[data-test="chart-renderer"] canvas').click({ position: { x: 445, y: 15 } });
    //     await page.getByText('Kubernetes Container Hash :').click();
    //     await page.locator('[data-test="dashboard-y-item-kubernetes_container_hash"]').click();
    //     await page.locator('.layout-panel-container > .flex').click();
    //     await page.locator('[data-test="dashboard-filter-item-kubernetes_host"]').click();
    //     await page.locator('[data-test="dashboard-filter-condition-panel"]').getByText('arrow_drop_down').click();
    //     await page.getByRole('option', { name: '<>' }).click();
    //     await page.locator('[data-test="dashboard-apply"]').click();

    // Save and delete the panel
    //   await page.locator('[data-test="chart-renderer"] canvas').click({ position: { x: 445, y: 16 } });
    //  await page.getByText('Kubernetes Container Hash :').click();
    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page
      .locator('[data-test="dashboard-panel-name"]')
      .fill("Dash1_Filter");
    await page.locator('[data-test="dashboard-panel-save"]').click();

    await page
      .locator('[data-test="dashboard-edit-panel-Dash1_Filter-dropdown"]')
      .click();
    await page.locator('[data-test="dashboard-delete-panel"]').click();
    await page.locator('[data-test="confirm-button"]').click();
  });

  test("should display an error message when a required field is missing", async ({
    page,
  }) => {
    // Navigate to dashboards section
    await page.locator('[data-test="menu-link-\\/dashboards-item"]').click();
    await waitForDashboardPage(page);

    // Add a new dashboard
    await page.locator('[data-test="dashboard-add"]').click();
    // Enter dashboard name and submit
    await page.locator('[data-test="add-dashboard-name"]').click();
    await page
      .locator('[data-test="add-dashboard-name"]')
      .fill(randomDashboardName);
    await page.locator('[data-test="dashboard-add-submit"]').click();

    // Add a new panel and configure it
    await page
      .locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .click();
    await page
      .locator("label")
      .filter({ hasText: "Streamarrow_drop_down" })
      .locator("i")
      .click();
    await page
      .getByRole("option", { name: "e2e_automate" })
      .locator("div")
      .nth(2)
      .click();
    // await page.locator('[data-test="field-list-item-logs-e2e_automate-kubernetes_container_hash"] [data-test="dashboard-add-x-data"]').click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_name"] [data-test="dashboard-add-y-data"]'
      )
      .click();
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_host"] [data-test="dashboard-add-b-data"]'
      )
      .click();

    // Remove X-Axis field and apply changes
    await page
      .locator('[data-test="dashboard-x-item-_timestamp-remove"]')
      .click();
    await page.locator('[data-test="dashboard-apply"]').click();

    // Update assertion to check error messages
    await expect(page.getByText("There are some errors, please")).toHaveText(
      "There are some errors, please fix them and try again"
    );
    await expect(page.getByText("Add one fields for the X-Axis")).toHaveText(
      "Add one fields for the X-Axis"
    );

    // Complete panel configuration
    await page.locator('[data-test="selected-chart-table-item"] img').click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.locator('[data-test="selected-chart-area-item"] img').click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.locator('[data-test="dashboard-panel-name"]').click();
    await page.locator('[data-test="dashboard-panel-name"]').fill("Dashboard");
    await page.locator('[data-test="dashboard-panel-save"]').click();
    await page.waitForTimeout(100);

    // Add X-Axis field and save the panel
    await page
      .locator(
        '[data-test="field-list-item-logs-e2e_automate-kubernetes_container_image"] [data-test="dashboard-add-x-data"]'
      )
      .click();
    await page.locator('[data-test="dashboard-apply"]').click();
    await page.locator('[data-test="dashboard-panel-save"]').click();

    // Delete the panel and confirm
    await page
      .locator('[data-test="dashboard-edit-panel-Dashboard-dropdown"]')
      .click();
    await page.locator('[data-test="dashboard-delete-panel"]').click();
    await expect(page.getByText("Are you sure you want to")).toHaveText(
      "Are you sure you want to delete this Panel?"
    );
    await page.locator('[data-test="confirm-button"]').click();
  });
});
