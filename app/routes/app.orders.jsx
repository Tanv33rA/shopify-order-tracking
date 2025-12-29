import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

/**
 * Determines the fulfillment status of an order based on its fulfillments.
 * Uses displayStatus from fulfillments as the primary source.
 * 
 * @param {Object} order - The order object with fulfillments
 * @returns {string} - One of: DELIVERED, NOT_DELIVERED, FULFILLED, IN_TRANSIT
 */
const getOrderFulfillmentStatus = (order) => {
  const fulfillments = order.fulfillments || [];
  
  // If no fulfillments, consider it NOT_DELIVERED
  if (fulfillments.length === 0) {
    return "NOT_DELIVERED";
  }

  // Check all fulfillments for status
  // Use displayStatus as primary source, fallback to status
  for (const fulfillment of fulfillments) {
    const displayStatus = fulfillment.displayStatus || fulfillment.status;
    
    if (displayStatus === "DELIVERED") {
      return "DELIVERED";
    }
    if (displayStatus === "FULFILLED") {
      return "FULFILLED";
    }
    if (displayStatus === "IN_TRANSIT") {
      return "IN_TRANSIT";
    }
  }

  // If we have fulfillments but none match the above, check for partial fulfillment
  const hasFulfilled = fulfillments.some(
    (f) => (f.displayStatus || f.status) === "FULFILLED"
  );
  
  if (hasFulfilled) {
    return "FULFILLED";
  }

  // Default to NOT_DELIVERED if we have fulfillments but unclear status
  return "NOT_DELIVERED";
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(`#graphql
      query OrdersForStatusGraph {
        orders(first: 250, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFulfillmentStatus
              fulfillments {
                status
                displayStatus
              }
            }
          }
        }
      }
    `);

    const json = await response.json();

    // Check for GraphQL errors
    if (json.errors) {
      const accessDenied = json.errors.some(
        (error) =>
          error.message?.includes("Access denied") ||
          error.message?.includes("not approved") ||
          error.message?.includes("Order object")
      );

      if (accessDenied) {
        return {
          error: "access_denied",
          message:
            "This app needs to be reinstalled to access orders. Please uninstall and reinstall the app to grant order permissions.",
        };
      }
    }

    const orders = json.data?.orders?.edges?.map((edge) => edge.node) ?? [];

    // Initialize counters
    const statusCounts = {
      DELIVERED: 0,
      NOT_DELIVERED: 0,
      FULFILLED: 0,
      IN_TRANSIT: 0,
    };

    // Group orders by fulfillment status
    for (const order of orders) {
      const status = getOrderFulfillmentStatus(order);
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status] += 1;
      }
    }

    const totalOrders = orders.length;
    const deliveredCount = statusCounts.DELIVERED;
    const notDeliveredCount =
      statusCounts.NOT_DELIVERED +
      statusCounts.FULFILLED +
      statusCounts.IN_TRANSIT;

    // Calculate percentages
    const deliveredPercent =
      totalOrders > 0
        ? Math.round((deliveredCount / totalOrders) * 100 * 100) / 100
        : 0;
    const notDeliveredPercent =
      totalOrders > 0
        ? Math.round((notDeliveredCount / totalOrders) * 100 * 100) / 100
        : 0;

    // Calculate percentages by status
    const percentageByStatus = {
      DELIVERED:
        totalOrders > 0
          ? Math.round((statusCounts.DELIVERED / totalOrders) * 100 * 100) / 100
          : 0,
      NOT_DELIVERED:
        totalOrders > 0
          ? Math.round((statusCounts.NOT_DELIVERED / totalOrders) * 100 * 100) /
            100
          : 0,
      FULFILLED:
        totalOrders > 0
          ? Math.round((statusCounts.FULFILLED / totalOrders) * 100 * 100) / 100
          : 0,
      IN_TRANSIT:
        totalOrders > 0
          ? Math.round((statusCounts.IN_TRANSIT / totalOrders) * 100 * 100) /
            100
          : 0,
    };

    return {
      totalOrders,
      statusCounts,
      percentages: {
        delivered: deliveredPercent,
        notDelivered: notDeliveredPercent,
        byStatus: percentageByStatus,
      },
      error: null,
    };
  } catch (error) {
    if (
      error.message?.includes("Access denied") ||
      error.message?.includes("not approved") ||
      error.message?.includes("Order object")
    ) {
      return {
        error: "access_denied",
        message:
          "This app needs to be reinstalled to access orders. Please uninstall and reinstall the app to grant order permissions.",
      };
    }
    throw error;
  }
};

export default function OrdersOverview() {
  const data = useLoaderData();

  // Handle access denied error
  if (data.error === "access_denied") {
    return (
      <s-page heading="Orders status overview">
        <s-card padding="base">
          <s-stack gap="base">
            <s-heading>Permission Required</s-heading>
            <s-text as="p">{data.message}</s-text>
            <s-stack gap="small">
              <s-text as="p" fontWeight="semibold">
                To fix this:
              </s-text>
              <s-unordered-list>
                <s-list-item>
                  Deploy the updated app configuration:{" "}
                  <s-text as="code">npm run deploy</s-text>
                </s-list-item>
                <s-list-item>
                  Uninstall the app from your test store (Settings → Apps and
                  sales channels → Hello App → Uninstall)
                </s-list-item>
                <s-list-item>
                  Reinstall the app by opening it again - you'll be prompted to
                  approve the new permissions
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-stack>
        </s-card>
      </s-page>
    );
  }

  const {
    totalOrders,
    statusCounts,
    percentages,
  } = data;

  return (
    <s-page heading="Orders Status Overview">
      <s-grid gap="base" columns="repeat(auto-fit, minmax(300px, 1fr))">
        {/* Summary Card */}
        <s-card padding="base" title="Order Summary">
          <s-stack gap="base">
            <s-text as="p" fontWeight="semibold" fontSize="large">
              Total Orders: <strong>{totalOrders}</strong>
            </s-text>
            <s-divider />
            <s-stack gap="small">
              <s-text as="p">
                Delivered: <strong>{statusCounts.DELIVERED}</strong> (
                {percentages.byStatus.DELIVERED}%)
              </s-text>
              <s-text as="p">
                Fulfilled: <strong>{statusCounts.FULFILLED}</strong> (
                {percentages.byStatus.FULFILLED}%)
              </s-text>
              <s-text as="p">
                In Transit: <strong>{statusCounts.IN_TRANSIT}</strong> (
                {percentages.byStatus.IN_TRANSIT}%)
              </s-text>
              <s-text as="p">
                Not Delivered: <strong>{statusCounts.NOT_DELIVERED}</strong> (
                {percentages.byStatus.NOT_DELIVERED}%)
              </s-text>
            </s-stack>
          </s-stack>
        </s-card>

        {/* Delivered vs Not Delivered Chart */}
        <s-card padding="base" title="Delivered vs Not Delivered">
          <s-stack gap="base">
            <div
              style={{
                display: "flex",
                inlineSize: "100%",
                blockSize: "32px",
                borderRadius: "999px",
                overflow: "hidden",
                background: "var(--p-color-bg-subdued, #f4f6f8)",
              }}
            >
              <div
                style={{
                  flexBasis: `${percentages.delivered}%`,
                  background: "#007f5f",
                  transition: "flex-basis 150ms ease-out",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
                aria-label={`Delivered ${percentages.delivered}%`}
              >
                {percentages.delivered > 5 && `${percentages.delivered}%`}
              </div>
              <div
                style={{
                  flexBasis: `${percentages.notDelivered}%`,
                  background: "#d72c0d",
                  transition: "flex-basis 150ms ease-out",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
                aria-label={`Not Delivered ${percentages.notDelivered}%`}
              >
                {percentages.notDelivered > 5 && `${percentages.notDelivered}%`}
              </div>
            </div>

            <s-stack direction="inline" gap="base" alignItems="center" wrap>
              <s-badge tone="success">
                Delivered {percentages.delivered}% ({statusCounts.DELIVERED})
              </s-badge>
              <s-badge tone="critical">
                Not Delivered {percentages.notDelivered}% ({statusCounts.NOT_DELIVERED + statusCounts.FULFILLED + statusCounts.IN_TRANSIT})
              </s-badge>
            </s-stack>
          </s-stack>
        </s-card>

        {/* Status Breakdown Chart */}
        <s-card padding="base" title="Status Breakdown">
          <s-stack gap="base">
            {/* DELIVERED */}
            <s-stack gap="small">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-text fontWeight="semibold">DELIVERED</s-text>
                <s-badge tone="success">
                  {statusCounts.DELIVERED} ({percentages.byStatus.DELIVERED}%)
                </s-badge>
              </s-stack>
              <div
                style={{
                  display: "flex",
                  inlineSize: "100%",
                  blockSize: "20px",
                  borderRadius: "4px",
                  overflow: "hidden",
                  background: "var(--p-color-bg-subdued, #f4f6f8)",
                }}
              >
                <div
                  style={{
                    flexBasis: `${percentages.byStatus.DELIVERED}%`,
                    background: "#007f5f",
                    transition: "flex-basis 150ms ease-out",
                  }}
                />
              </div>
            </s-stack>

            {/* FULFILLED */}
            <s-stack gap="small">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-text fontWeight="semibold">FULFILLED</s-text>
                <s-badge tone="info">
                  {statusCounts.FULFILLED} ({percentages.byStatus.FULFILLED}%)
                </s-badge>
              </s-stack>
              <div
                style={{
                  display: "flex",
                  inlineSize: "100%",
                  blockSize: "20px",
                  borderRadius: "4px",
                  overflow: "hidden",
                  background: "var(--p-color-bg-subdued, #f4f6f8)",
                }}
              >
                <div
                  style={{
                    flexBasis: `${percentages.byStatus.FULFILLED}%`,
                    background: "#008060",
                    transition: "flex-basis 150ms ease-out",
                  }}
                />
              </div>
            </s-stack>

            {/* IN_TRANSIT */}
            <s-stack gap="small">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-text fontWeight="semibold">IN TRANSIT</s-text>
                <s-badge tone="info">
                  {statusCounts.IN_TRANSIT} ({percentages.byStatus.IN_TRANSIT}%)
                </s-badge>
              </s-stack>
              <div
                style={{
                  display: "flex",
                  inlineSize: "100%",
                  blockSize: "20px",
                  borderRadius: "4px",
                  overflow: "hidden",
                  background: "var(--p-color-bg-subdued, #f4f6f8)",
                }}
              >
                <div
                  style={{
                    flexBasis: `${percentages.byStatus.IN_TRANSIT}%`,
                    background: "#1c6fbb",
                    transition: "flex-basis 150ms ease-out",
                  }}
                />
              </div>
            </s-stack>

            {/* NOT_DELIVERED */}
            <s-stack gap="small">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-text fontWeight="semibold">NOT DELIVERED</s-text>
                <s-badge tone="critical">
                  {statusCounts.NOT_DELIVERED} ({percentages.byStatus.NOT_DELIVERED}%)
                </s-badge>
              </s-stack>
              <div
                style={{
                  display: "flex",
                  inlineSize: "100%",
                  blockSize: "20px",
                  borderRadius: "4px",
                  overflow: "hidden",
                  background: "var(--p-color-bg-subdued, #f4f6f8)",
                }}
              >
                <div
                  style={{
                    flexBasis: `${percentages.byStatus.NOT_DELIVERED}%`,
                    background: "#d72c0d",
                    transition: "flex-basis 150ms ease-out",
                  }}
                />
              </div>
            </s-stack>
          </s-stack>
        </s-card>
      </s-grid>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);


