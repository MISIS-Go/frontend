import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

jest.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr_test',
      email: 'test@example.com',
      display_name: 'Test User',
    },
  }),
}));

test('renders SafeMind dashboard heading', async () => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/api/settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          user_id: 'usr_test',
          notification_frequency_minutes: 30,
          moodboard: 'sunrise',
          site_limits: [],
        }),
      });
    }

    if (String(url).includes('/api/site-stats')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          user_id: 'usr_test',
          sites: [],
          recent_visits: [],
          totals: {
            total_time_spent: 0,
            average_anxiety_level: 0,
            tracked_sites: 0,
            alerting_sites: 0,
          },
        }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({
        user_id: 'usr_test',
        total_anxiety_level: 0,
        total_time_spent: 0,
        tracked_visits: 0,
        focus_sites: [],
        recommendation: 'test',
        wellbeing_score: 100,
      }),
    });
  });

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByText(/Интерфейс цифровой гигиены для людей/i),
  ).toBeInTheDocument();
});
