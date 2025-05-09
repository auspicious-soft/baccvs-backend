import * as React from 'react';

import { Html, Button, Head, Container, Img } from "@react-email/components";
interface EmailProps {
  otp: string;
}
const VerificationEmail: React.FC<Readonly<EmailProps>> = (props) => {
  const { otp } = props
  return (
    <Html lang="en">
      <Head>
        <title>Baccvs Email verification code</title>
      </Head>
      <Container>
        <h1 style={{ color: "black" }}>Verify your email</h1>
        <p style={{ color: "black" }}>Below is the otp for verifying your email.</p> - <b style={{ color: "black" }}>{otp}</b>
        <p style={{ color: "#6c757d" }}>Verify Email To SignUp.</p>
      </Container>
    </Html>
  );
}
export default VerificationEmail