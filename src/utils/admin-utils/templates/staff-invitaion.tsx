import * as React from "react";
import {
  Html,
  Head,
  Container,
  Section,
  Text,
  Button,
} from "@react-email/components";

interface StaffInvitationEmailProps {
  inviteLink: string;
  staffName: string;
  invitedBy: string;
  companyName?: string;
}

const StaffInvitationEmail: React.FC<
  Readonly<StaffInvitationEmailProps>
> = ({ inviteLink, staffName, invitedBy, companyName }) => {
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
        {/* Header */}
        <Section
          style={{
            backgroundColor: "#111827",
            borderRadius: "8px 8px 0 0",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <Text
            style={{
              fontSize: "22px",
              fontWeight: "700",
              color: "#ffffff",
              marginBottom: "8px",
            }}
          >
            You’ve Been Granted Access!
          </Text>

          <Text
            style={{
              fontSize: "16px",
              color: "#d1d5db",
            }}
          >
            Welcome to the Admin Dashboard
          </Text>
        </Section>

        {/* Body */}
        <Section
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "0 0 8px 8px",
            padding: "32px",
          }}
        >
          <Text
            style={{
              fontSize: "16px",
              color: "#111827",
              marginBottom: "16px",
            }}
          >
            Hi {staffName},
          </Text>

          <Text
            style={{
              fontSize: "15px",
              color: "#374151",
              lineHeight: "24px",
              marginBottom: "16px",
            }}
          >
            You’ve just been added as a <b>Sub-Admin</b> to the{" "}
            <b>{companyName || "Baccvs"}</b> dashboard by {invitedBy}.
            This means you now have access to essential tools and controls
            to help manage and support your team effectively.
          </Text>

          <Text
            style={{
              fontSize: "15px",
              color: "#374151",
              lineHeight: "24px",
              marginBottom: "16px",
            }}
          >
            Here’s what you can do right away:
          </Text>

          <Text
            style={{
              fontSize: "15px",
              color: "#374151",
              lineHeight: "24px",
              marginBottom: "8px",
            }}
          >
            • Access your admin dashboard <br />
            • Manage users and permissions
          </Text>

          <Text
            style={{
              fontSize: "15px",
              color: "#374151",
              marginTop: "16px",
              marginBottom: "24px",
            }}
          >
            To get started, simply click the button below:
          </Text>

          <Button
            href={inviteLink}
            style={{
              backgroundColor: "#2563eb",
              color: "#ffffff",
              padding: "12px 28px",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Join Baccav Admin
          </Button>

          <Text
            style={{
              fontSize: "14px",
              color: "#6b7280",
              marginTop: "24px",
              lineHeight: "22px",
            }}
          >
            If you did not expect this email, please ignore it or contact
            your administrator.
          </Text>

          <Text
            style={{
              fontSize: "14px",
              color: "#374151",
              marginTop: "24px",
            }}
          >
            Thanks for being part of the team — we’re excited to have you onboard!
            <br />
            Best regards,
            <br />
            <b>{companyName || "Baccvs"} Team</b>
          </Text>
        </Section>

        <Section
          style={{
            marginTop: "16px",
            textAlign: "center",
          }}
        >
          <Text
            style={{
              fontSize: "13px",
              color: "#6b7280",
              lineHeight: "20px",
            }}
          >
            Baccav is a social platform that helps you discover nearby
            parties, connect with people attending the same events, and
            easily host your own gatherings, making every outing more fun,
            social, and effortless.
          </Text>
        </Section>
      </Container>
    </Html>
  );
};

export default StaffInvitationEmail;
