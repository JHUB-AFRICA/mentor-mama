import { Button, Container } from "@mentormama/ui";

export function App() {
  return (
    <Container className="py-20 text-center">
      <h1 className="font-display text-display text-navy">MentorMAMA Portal</h1>
      <p className="mt-4 font-body text-body text-navy/80">
        Sign in to manage mentorship sessions, training, and dashboards.
      </p>
      <Button className="mt-8">Sign In</Button>
    </Container>
  );
}
