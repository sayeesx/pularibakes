import React from 'react';
import { Navigate } from 'react-router-dom';

export const StockPage: React.FC = () => {
  return <Navigate to="/ingredients" replace />;
};
