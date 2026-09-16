<template>
  <view class="app-information-row">
    <view class="app-information-row__label"><slot name="label" /></view>
    <view class="app-information-row__value"><slot name="value" /></view>
    <view v-if="$slots.trailing" class="app-information-row__trailing"><slot name="trailing" /></view>
  </view>
</template>
