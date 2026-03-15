import { render, screen } from '@testing-library/react';
import App from './App';

test('renders hackathon starter headline', () => {
  render(<App />);
  const headingElement = screen.getByText(/ship the demo before the judges sit down/i);
  expect(headingElement).toBeInTheDocument();
});
