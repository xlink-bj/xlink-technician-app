<template>
  <view class="product-review-page" data-testid="commercial-review-orders">
    <view class="product-review-top">
      <text class="product-review-kicker">今日任务</text>
      <text class="product-review-title">我的工单</text>
      <text class="product-review-subtitle">查看需要处理的服务任务</text>
    </view>

    <view class="product-review-section">
      <view class="product-review-section-heading">
        <text>待报价</text>
        <text class="product-review-count">1 个工单</text>
      </view>
      <navigator
        class="product-review-order-card"
        url="/pages/product/detail"
        data-testid="commercial-review-open-detail"
      >
        <view class="product-review-row">
          <text class="product-review-order-name">屋面防水维修</text>
          <text class="product-review-state">待报价</text>
        </view>
        <text class="product-review-meta">演示报价工单 · #MOCK-018</text>
        <view class="product-review-card-footer">
          <text>查看工单并继续报价</text>
          <text class="product-review-chevron">›</text>
        </view>
      </navigator>
    </view>

    <text class="product-review-disclaimer">演示数据 · 不涉及真实客户或业务提交</text>
  </view>
</template>

<style scoped>
.product-review-page { background: #f3f6fa; box-sizing: border-box; min-height: 100vh; padding: 36rpx 28rpx; }
.product-review-top { display: flex; flex-direction: column; gap: 8rpx; padding: 16rpx 4rpx 40rpx; }
.product-review-kicker { color: #286ff0; font-size: 23rpx; font-weight: 650; }
.product-review-title { color: #1c2940; font-size: 43rpx; font-weight: 800; }
.product-review-subtitle { color: #77859a; font-size: 25rpx; }
.product-review-section { background: #fff; border: 1rpx solid #e6edf7; border-radius: 24rpx; padding: 28rpx; }
.product-review-section-heading,.product-review-row,.product-review-card-footer { align-items: center; display: flex; justify-content: space-between; }
.product-review-section-heading { color: #223148; font-size: 29rpx; font-weight: 750; margin-bottom: 26rpx; }
.product-review-count { color: #8391a6; font-size: 22rpx; font-weight: 400; }
.product-review-order-card { border: 1rpx solid #dfe8f6; border-radius: 18rpx; overflow: hidden; padding: 25rpx; }
.product-review-order-name { color: #25324b; font-size: 29rpx; font-weight: 750; }
.product-review-state { background: #eaf2ff; border-radius: 25rpx; color: #2876ee; font-size: 21rpx; padding: 7rpx 14rpx; }
.product-review-meta { color: #78869b; display: block; font-size: 23rpx; margin-top: 12rpx; }
.product-review-card-footer { border-top: 1rpx solid #eef2f8; color: #2876ee; font-size: 25rpx; margin-top: 22rpx; padding-top: 20rpx; }
.product-review-chevron { font-size: 34rpx; }
.product-review-disclaimer { color: #97a3b4; display: block; font-size: 21rpx; margin: 32rpx 8rpx; text-align: center; }
</style>
