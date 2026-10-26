import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/(agent)/create')({
  beforeLoad: () => {
    throw redirect({ to: '/', hash: 'create', replace: true, statusCode: 301 });
  },
});
