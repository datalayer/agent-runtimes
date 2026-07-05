/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Link as RouterLink,
  NavLink,
  Outlet,
  Navigate,
} from 'react-router-dom';
import { Box, Button, Heading, Text, TextInput } from '@primer/react';
import { useNavigate, useLocation, useParams, useHistory } from '../hooks';

/**
 * Navigation Logger Component - Shows all navigation events
 */
const NavigationLogger: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const location = useLocation();
  const params = useParams();

  useEffect(() => {
    const log = `[${new Date().toLocaleTimeString()}] Navigated to ${location.pathname}${location.search}${location.hash} | Params: ${JSON.stringify(params)} | State: ${JSON.stringify(location.state)}`;
    setLogs(prev => [...prev.slice(-9), log]);
  }, [location, params]);

  return (
    <Box
      sx={{
        p: 2,
        mb: 3,
        bg: 'canvas.subtle',
        borderRadius: 2,
        fontSize: 0,
        fontFamily: 'mono',
        maxHeight: 150,
        overflowY: 'auto',
      }}
    >
      <Text as="div" sx={{ fontWeight: 'bold', mb: 1 }}>
        Navigation Log:
      </Text>
      {logs.map((log, i) => (
        <Text key={i} as="div" sx={{ color: 'fg.muted' }}>
          {log}
        </Text>
      ))}
    </Box>
  );
};

/**
 * Navigation Controls - Test all navigation methods
 */
const NavigationControls: React.FC = () => {
  const navigate = useNavigate();
  const history = useHistory();
  const location = useLocation();
  const [customPath, setCustomPath] = useState('/custom');
  const [stateValue, setStateValue] = useState('');

  const handleNavigateWithState = () => {
    navigate('/dashboard/analytics', {
      state: { message: stateValue || 'Hello from navigation!' },
    });
  };

  const handleReplaceWithState = () => {
    history.replace('/settings', { replaced: true, time: Date.now() });
  };

  const handleNavigateWithQuery = () => {
    navigate('/search?q=react&category=framework');
  };

  const handleNavigateWithHash = () => {
    navigate('/docs#installation');
  };

  const handleComplexNavigation = () => {
    navigate('/products/123/reviews?sort=newest#review-42');
  };

  return (
    <Box
      sx={{
        p: 3,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'border.default',
        borderRadius: 2,
        mb: 3,
      }}
    >
      <Heading as="h3" sx={{ mb: 3 }}>
        Navigation Controls
      </Heading>

      <Box sx={{ mb: 3 }}>
        <Text as="label" sx={{ display: 'block', mb: 1, fontSize: 1 }}>
          Custom Path:
        </Text>
        <TextInput
          value={customPath}
          onChange={e => setCustomPath(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button onClick={() => navigate(customPath)} sx={{ mr: 2 }}>
          Navigate to Custom Path
        </Button>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Text as="label" sx={{ display: 'block', mb: 1, fontSize: 1 }}>
          State Value:
        </Text>
        <TextInput
          value={stateValue}
          onChange={e => setStateValue(e.target.value)}
          placeholder="Enter state to pass"
          sx={{ mb: 2 }}
        />
        <Button onClick={handleNavigateWithState} variant="primary">
          Navigate with State
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Button onClick={() => history.back()} variant="default">
          ← Back
        </Button>
        <Button onClick={() => history.forward()} variant="default">
          Forward →
        </Button>
        <Button onClick={handleReplaceWithState} variant="default">
          Replace Current
        </Button>
        <Button onClick={handleNavigateWithQuery} variant="default">
          Nav with Query
        </Button>
        <Button onClick={handleNavigateWithHash} variant="default">
          Nav with Hash
        </Button>
        <Button onClick={handleComplexNavigation} variant="default">
          Complex Navigation
        </Button>
      </Box>

      <Box sx={{ p: 2, bg: 'canvas.inset', borderRadius: 1 }}>
        <Text as="div" sx={{ fontSize: 0, fontFamily: 'mono' }}>
          <strong>Current Location:</strong>
          <br />
          Path: {location.pathname}
          <br />
          Search: {location.search || '(none)'}
          <br />
          Hash: {location.hash || '(none)'}
          <br />
          State: {JSON.stringify(location.state) || '(none)'}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Layout Component with Navigation Menu
 */
const Layout: React.FC = () => {
  return (
    <Box>
      <Box
        as="nav"
        sx={{
          p: 3,
          bg: 'canvas.subtle',
          borderBottom: '1px solid',
          borderColor: 'border.default',
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <NavLink
            to="/"
            style={({ isActive }) => ({
              fontWeight: isActive ? 'bold' : 'normal',
              color: isActive ? '#0969da' : 'inherit',
              textDecoration: 'none',
            })}
          >
            Home
          </NavLink>
          <NavLink
            to="/dashboard"
            style={({ isActive }) => ({
              fontWeight: isActive ? 'bold' : 'normal',
              color: isActive ? '#0969da' : 'inherit',
              textDecoration: 'none',
            })}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/products"
            style={({ isActive }) => ({
              fontWeight: isActive ? 'bold' : 'normal',
              color: isActive ? '#0969da' : 'inherit',
              textDecoration: 'none',
            })}
          >
            Products
          </NavLink>
          <NavLink
            to="/users/john-doe"
            style={({ isActive }) => ({
              fontWeight: isActive ? 'bold' : 'normal',
              color: isActive ? '#0969da' : 'inherit',
              textDecoration: 'none',
            })}
          >
            User Profile
          </NavLink>
          <NavLink
            to="/settings"
            style={({ isActive }) => ({
              fontWeight: isActive ? 'bold' : 'normal',
              color: isActive ? '#0969da' : 'inherit',
              textDecoration: 'none',
            })}
          >
            Settings
          </NavLink>
        </Box>
      </Box>

      <NavigationLogger />
      <NavigationControls />

      <Box
        sx={{
          p: 3,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'border.default',
          borderRadius: 2,
          minHeight: 200,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

/**
 * Page Components
 */
const HomePage: React.FC = () => (
  <Box>
    <Heading as="h1" sx={{ mb: 3 }}>
      Home Page
    </Heading>
    <Text as="p">
      Welcome to the comprehensive React Router example. This demonstrates:
    </Text>
    <ul>
      <li>Programmatic navigation with useNavigate</li>
      <li>Route parameters with useParams</li>
      <li>Query parameters and hash navigation</li>
      <li>Navigation state passing</li>
      <li>Browser history (back/forward)</li>
      <li>Nested routes</li>
      <li>Protected routes</li>
      <li>Active link styling</li>
    </ul>
  </Box>
);

const DashboardLayout: React.FC = () => (
  <Box>
    <Heading as="h1" sx={{ mb: 2 }}>
      Dashboard
    </Heading>
    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
      <RouterLink to="/dashboard">Overview</RouterLink>
      <RouterLink to="/dashboard/analytics">Analytics</RouterLink>
      <RouterLink to="/dashboard/reports">Reports</RouterLink>
    </Box>
    <Outlet />
  </Box>
);

const DashboardOverview: React.FC = () => {
  const location = useLocation();
  return (
    <Box>
      <Heading as="h2" sx={{ mb: 2 }}>
        Overview
      </Heading>
      {location.state && (
        <Box sx={{ p: 2, bg: 'success.subtle', borderRadius: 1, mb: 2 }}>
          <Text>State received: {JSON.stringify(location.state)}</Text>
        </Box>
      )}
      <Text>Dashboard overview content here...</Text>
    </Box>
  );
};

const DashboardAnalytics: React.FC = () => {
  const location = useLocation();
  return (
    <Box>
      <Heading as="h2" sx={{ mb: 2 }}>
        Analytics
      </Heading>
      {location.state && (
        <Box sx={{ p: 2, bg: 'success.subtle', borderRadius: 1, mb: 2 }}>
          <Text>State received: {JSON.stringify(location.state)}</Text>
        </Box>
      )}
      <Text>Analytics data visualization would go here...</Text>
    </Box>
  );
};

const DashboardReports: React.FC = () => (
  <Box>
    <Heading as="h2" sx={{ mb: 2 }}>
      Reports
    </Heading>
    <Text>Reports section content...</Text>
  </Box>
);

const ProductList: React.FC = () => {
  const navigate = useNavigate();
  const products = [
    { id: 1, name: 'Product A' },
    { id: 2, name: 'Product B' },
    { id: 3, name: 'Product C' },
  ];

  return (
    <Box>
      <Heading as="h1" sx={{ mb: 3 }}>
        Products
      </Heading>
      <Box sx={{ display: 'grid', gap: 2 }}>
        {products.map(product => (
          <Button
            key={product.id}
            onClick={() => navigate(`/products/${product.id}`)}
            variant="default"
            sx={{ justifyContent: 'flex-start' }}
          >
            {product.name} →
          </Button>
        ))}
      </Box>
    </Box>
  );
};

const ProductDetail: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();

  return (
    <Box>
      <Button
        onClick={() => navigate('/products')}
        variant="default"
        sx={{ mb: 3 }}
      >
        ← Back to Products
      </Button>
      <Heading as="h1" sx={{ mb: 2 }}>
        Product Details
      </Heading>
      <Text as="p">Product ID: {params.id}</Text>
      <Text as="p">All params: {JSON.stringify(params)}</Text>
      <Box sx={{ mt: 3 }}>
        <Button
          onClick={() => navigate(`/products/${params.id}/reviews`)}
          variant="primary"
        >
          View Reviews
        </Button>
      </Box>
    </Box>
  );
};

const ProductReviews: React.FC = () => {
  const params = useParams();
  const location = useLocation();

  return (
    <Box>
      <Heading as="h1" sx={{ mb: 2 }}>
        Reviews for Product {params.id}
      </Heading>
      <Text as="p">Query params: {location.search}</Text>
      <Text as="p">Hash: {location.hash}</Text>
    </Box>
  );
};

const UserProfile: React.FC = () => {
  const params = useParams();
  return (
    <Box>
      <Heading as="h1" sx={{ mb: 2 }}>
        User Profile
      </Heading>
      <Text>Username: {params.username}</Text>
    </Box>
  );
};

const SearchPage: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const query = searchParams.get('q');
  const category = searchParams.get('category');

  return (
    <Box>
      <Heading as="h1" sx={{ mb: 2 }}>
        Search Results
      </Heading>
      <Text as="p">Query: {query || '(none)'}</Text>
      <Text as="p">Category: {category || '(none)'}</Text>
      <Text as="p">Full search string: {location.search}</Text>
    </Box>
  );
};

const DocsPage: React.FC = () => {
  const location = useLocation();
  return (
    <Box>
      <Heading as="h1" sx={{ mb: 2 }}>
        Documentation
      </Heading>
      <Text as="p">Current hash: {location.hash || '(none)'}</Text>
      {location.hash === '#installation' && (
        <Box sx={{ p: 2, bg: 'attention.subtle', borderRadius: 1, mt: 2 }}>
          <Heading as="h2" sx={{ mb: 1 }}>
            Installation
          </Heading>
          <Text>Installation instructions would be here...</Text>
        </Box>
      )}
    </Box>
  );
};

const SettingsPage: React.FC = () => {
  const location = useLocation();
  return (
    <Box>
      <Heading as="h1" sx={{ mb: 2 }}>
        Settings
      </Heading>
      {location.state?.replaced && (
        <Box sx={{ p: 2, bg: 'attention.subtle', borderRadius: 1, mb: 2 }}>
          <Text>This page replaced the previous history entry!</Text>
          <Text>
            Time: {new Date(location.state.time).toLocaleTimeString()}
          </Text>
        </Box>
      )}
      <Text>Settings configuration would go here...</Text>
    </Box>
  );
};

const NotFound: React.FC = () => (
  <Box>
    <Heading as="h1" sx={{ mb: 2, color: 'danger.fg' }}>
      404 - Not Found
    </Heading>
    <Text>The page you're looking for doesn't exist.</Text>
  </Box>
);

/**
 * Protected Route Component
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isAuthenticated] = useState(true); // Simulate authentication

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

/**
 * Main App Component - Advanced React Router Example
 */
export const ReactRouterAdvancedExample: React.FC = () => {
  return (
    <BrowserRouter>
      <Box sx={{ minHeight: '100vh', p: 4 }}>
        <Box sx={{ mb: 4, p: 3, bg: 'canvas.subtle', borderRadius: 2 }}>
          <Heading as="h1" sx={{ mb: 2 }}>
            Advanced React Router Navigation Example
          </Heading>
          <Text as="p" sx={{ mb: 2 }}>
            This comprehensive example demonstrates all navigation features
            working with our custom hooks that detect and use React Router.
          </Text>
          <Text as="p" sx={{ color: 'success.fg', fontWeight: 'bold' }}>
            ✓ React Router detected and integrated with Datalayer Client hooks
          </Text>
        </Box>

        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="dashboard" element={<DashboardLayout />}>
              <Route index element={<DashboardOverview />} />
              <Route path="analytics" element={<DashboardAnalytics />} />
              <Route path="reports" element={<DashboardReports />} />
            </Route>
            <Route path="products/:id/reviews" element={<ProductReviews />} />
            <Route path="products/:id" element={<ProductDetail />} />
            <Route path="products" element={<ProductList />} />
            <Route path="users/:username" element={<UserProfile />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="docs" element={<DocsPage />} />
            <Route
              path="settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route path="custom" element={<HomePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Box>
    </BrowserRouter>
  );
};

export default ReactRouterAdvancedExample;
