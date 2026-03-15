import { render, screen } from '@testing-library/react';
import App from './App';

test('renders SafeMind dashboard heading', () => {
  render(<App />);
  expect(
    screen.getByText(/Мониторинг тревожности, лимитов и цифровой перегрузки/i),
  ).toBeInTheDocument();
});
