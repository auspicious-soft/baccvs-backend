import * as React from "react";
import {
  Html,
  Head,
  Container,
  Section,
  Text,
  Img,
} from "@react-email/components";

interface EmailProps {
  otp: string;
}

const SignupVerification: React.FC<Readonly<EmailProps>> = ({ otp }) => {
  const subject = "Verify Your Email";
  const body = "Please use the following OTP to verify your email address:";
  const footer = "If you did not request this, please ignore this email.";
  const expiry = "This OTP is valid for 2 minutes.";

  return (
    <Html lang="en">
      <Head>
        <title>{subject}</title>
      </Head>
      <Container
        style={{
          maxWidth: "500px",
          margin: "0 auto",
          padding: "24px",
          backgroundColor: "#f9f9f9",
          borderRadius: "8px",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <Section style={{ textAlign: "center" }}>
          <Img
            src="https://your-logo-url.com/logo.png"
            alt="Disstrikt Logo"
            width="120"
            style={{ marginBottom: "20px" }}
          />
          <h1 style={{ color: "#333", fontSize: "24px", margin: "10px 0" }}>
            {subject}
          </h1>
          <Text
            style={{ fontSize: "16px", color: "#555", marginBottom: "12px" }}
          >
            {body}
          </Text>

          <Section
            style={{
              backgroundColor: "#ffffff",
              padding: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              display: "inline-block",
              margin: "20px 0",
            }}
          >
            <Text
              style={{
                fontSize: "28px",
                fontWeight: "bold",
                color: "#111",
                letterSpacing: "6px",
              }}
            >
              {otp}
            </Text>
          </Section>

          <Text style={{ fontSize: "14px", color: "#888", marginBottom: "6px" }}>
            {expiry}
          </Text>
          <Text style={{ fontSize: "14px", color: "#aaa" }}>{footer}</Text>
        </Section>
      </Container>
    </Html>
  );
};

export default SignupVerification;
