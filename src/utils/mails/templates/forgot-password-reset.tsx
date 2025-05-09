import * as React from 'react';
import { Html, Button, Head, Container, Img } from "@react-email/components";

interface EmailProps {
  resetLink: string;
}

const ForgotPasswordEmail: React.FC<Readonly<EmailProps>> = (props) => {
  const { resetLink } = props;
  return (
    <Html lang="en">
      <Head>
        <title>Reset your password</title>
      </Head>
      <Container>
        <h1 style={{ color: "black" }}>Reset your password</h1>
        <p style={{ color: "black" }}>Click the button below to reset your password.</p>
        <Button 
          href={resetLink}
          style={{
            backgroundColor: "#007bff",
            color: "white",
            padding: "12px 20px",
            borderRadius: "5px",
            textDecoration: "none"
          }}
        >
          Reset Password
        </Button>
        <p style={{ color: "#6c757d" }}>If you did not request a password reset, please ignore this email.</p>
      </Container>
    </Html>
  );
}

export default ForgotPasswordEmail;
