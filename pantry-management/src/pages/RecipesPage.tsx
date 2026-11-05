import React from 'react';
import { Navigate } from 'react-router-dom';

export const RecipesPage: React.FC = () => {
  return <Navigate to="/products" replace />;
};
