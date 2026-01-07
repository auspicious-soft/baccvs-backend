import * as React from "react";
import {
  Html,
  Head,
  Container,
  Section,
  Text,
  Button,
} from "@react-email/components";

interface ResetPasswordEmailProps {
  resetLink: string;
  companyName?: string;
}

const ResetPasswordEmail: React.FC<Readonly<ResetPasswordEmailProps>> = ({
  resetLink,
  companyName,
}) => {
  return (
    <Html lang="en">
      <Head />
      <Container
        style={{
          maxWidth: "520px",
          margin: "0 auto",
          padding: "24px",
          backgroundColor: "#f9fafb",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <Section
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <Text
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#111827",
              marginBottom: "16px",
            }}
          >
            Reset your password
          </Text>

          <Text
            style={{
              fontSize: "16px",
              color: "#374151",
              lineHeight: "24px",
              marginBottom: "24px",
            }}
          >
            We received a request to reset your password. Click the button below
            to set a new password. This link will expire in <b>15 minutes</b>.
          </Text>

          <Button
            href={resetLink}
            style={{
              backgroundColor: "#2563eb",
              color: "#ffffff",
              padding: "12px 24px",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Reset Password
          </Button>

          <Text
            style={{
              fontSize: "14px",
              color: "#6b7280",
              marginTop: "24px",
            }}
          >
            If you did not request this, you can safely ignore this email.
          </Text>

          <Text
            style={{
              fontSize: "14px",
              color: "#9ca3af",
              marginTop: "16px",
            }}
          >
            {companyName || "Your Company"}
          </Text>
        </Section>
      </Container>
    </Html>
  );
};

export default ResetPasswordEmail;
