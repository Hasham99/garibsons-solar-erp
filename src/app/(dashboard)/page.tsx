"use client"

import { useFetch } from "@/hooks/useFetch"
import { StatCard } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Package, AlertCircle, ShoppingCart, Receipt } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface DashboardData {
  summary: {
    totalPanels: number
    availablePanels: number
    reservedPanels: number
    totalStockValue: number
    availableStockValue: number
    reservedStockValue: number
    todaySales: number
    todaySalesCount: number
    totalReceivables: number
    totalGstInStock: number
    activePOs: number
    openDeliveryOrders: number
    agingDeliveryOrders: number
  }
  recentOrders: Array<{
    id: string
    soNumber: string
    customer: { name: string }
    grandTotal: number
    status: string
    createdAt: string
  }>
  warehouseStock: Array<{ name: string; availablePanels: number; reservedPanels: number; value: number }>
}

export default function DashboardPage() {
  const { data, loading } = useFetch<DashboardData>("/api/dashboard")

  if (loading) return <LoadingPage />

  const summary = data?.summary || {
    totalPanels: 0,
    availablePanels: 0,
    reservedPanels: 0,
    totalStockValue: 0,
    availableStockValue: 0,
    reservedStockValue: 0,
    todaySales: 0,
    todaySalesCount: 0,
    totalReceivables: 0,
    totalGstInStock: 0,
    activePOs: 0,
    openDeliveryOrders: 0,
    agingDeliveryOrders: 0,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back to Garibsons Solar ERP</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Current Stock"
          value={`${summary.totalPanels.toLocaleString()} panels`}
          subtitle={formatCurrency(summary.totalStockValue)}
          icon={<Package size={20} />}
          color="blue"
        />
        <StatCard
          title="Available to Sell"
          value={`${summary.availablePanels.toLocaleString()} panels`}
          subtitle={formatCurrency(summary.availableStockValue)}
          icon={<Package size={20} />}
          color="green"
        />
        <StatCard
          title="Reserved Stock"
          value={`${summary.reservedPanels.toLocaleString()} panels`}
          subtitle={formatCurrency(summary.reservedStockValue)}
          icon={<AlertCircle size={20} />}
          color="yellow"
        />
        <StatCard
          title="Import GST in Stock"
          value={formatCurrency(summary.totalGstInStock)}
          subtitle="GST paid at import, locked in inventory"
          icon={<Receipt size={20} />}
          color="yellow"
        />
        <StatCard
          title="Open Delivery Orders"
          value={summary.openDeliveryOrders}
          subtitle={`${summary.agingDeliveryOrders} aging 2+ days`}
          icon={<ShoppingCart size={20} />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock by Warehouse Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Stock by Warehouse</h3>
          {data?.warehouseStock && data.warehouseStock.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.warehouseStock}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [Number(value).toLocaleString(), "Panels"]}
                />
                <Bar dataKey="availablePanels" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400">
              No stock data available
            </div>
          )}
        </div>

        {/* Recent Sales Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Recent Sales Orders</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {data?.recentOrders && data.recentOrders.length > 0 ? (
              data.recentOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{order.soNumber}</p>
                    <p className="text-xs text-gray-500">
                      {order.customer.name} &middot; {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(order.grandTotal)}</p>
                    <Badge status={order.status} />
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-gray-400">
                No sales orders yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
