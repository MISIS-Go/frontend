# Frontend

React frontend for the hackathon template.

## Available scripts

- `npm start`: run the development server on port `3000`
- `npm run build`: create the production build used by the nginx container
- `npm test`: run the component tests

## Runtime expectations

- The UI expects the backend behind `/api`
- The UI expects the ML service behind `/ml`
- In Docker Compose those routes are provided by Traefik on `http://app.localhost`
