import {
  Form,
  useActionData,
  useLoaderData,
  useRouteError,
  redirect,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const sanitizeText = (value) => value?.toString().trim() || "";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const profiles = await prisma.profile.findMany({
    orderBy: { createdAt: "desc" },
  });
  return { profiles };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const name = sanitizeText(formData.get("name"));
  const ageValue = sanitizeText(formData.get("age"));
  const age = Number.parseInt(ageValue, 10);

  const errors = {};
  if (!name) errors.name = "Name is required";
  if (!ageValue) {
    errors.age = "Age is required";
  } else if (Number.isNaN(age) || age < 0) {
    errors.age = "Age must be a valid non-negative number";
  }

  if (Object.keys(errors).length) {
    return new Response(
      JSON.stringify({ errors, values: { name, age: ageValue } }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  await prisma.profile.create({
    data: { name, age },
  });

  return redirect("/app/profile");
};

export default function ProfilePage() {
  const { profiles } = useLoaderData();
  const actionData = useActionData();
  const errors = actionData?.errors || {};
  const values = actionData?.values || {};

  return (
    <s-page heading="Profile">
      <s-grid columns="1fr" gap="base">
        <s-card padding="base" title="Create profile">
          <Form method="post">
            <s-stack gap="base">
              <s-text-field
                name="name"
                label="Name"
                value={values.name ?? ""}
                placeholder="Enter name"
                error={errors.name}
              />
              <s-text-field
                name="age"
                label="Age"
                inputMode="numeric"
                value={values.age ?? ""}
                placeholder="Enter age"
                error={errors.age}
              />
              <s-button type="submit" variant="primary">
                Save
              </s-button>
            </s-stack>
          </Form>
        </s-card>

        <s-card padding="base" title="Saved profiles">
          {profiles.length === 0 ? (
            <s-paragraph>No profiles yet.</s-paragraph>
          ) : (
            <s-stack gap="small">
              {profiles.map((profile) => (
                <s-box
                  key={profile.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-text fontWeight="semibold">{profile.name}</s-text>
                  <s-text as="p">Age: {profile.age}</s-text>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-card>
      </s-grid>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

