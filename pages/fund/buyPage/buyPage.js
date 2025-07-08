Page({
  data: {
    currentNetValue_raw: 0,    // Raw value for calculation
    cash_raw: 0,               // Raw value for calculation  
    currentNetValue_display: '0.0000', // Formatted for display
    cash_display: '0.00',      // Formatted for display
    inputAmount: '',
    estimatedUnits: '0.00',
    isBuyingAll: false         // Flag to indicate if user clicked "buy all"
  },

  onLoad: function(options) {
    // 从URL参数获取传递过来的数据
    const currentNetValue_raw = parseFloat(options.netValue || 0);
    const cash_raw = parseFloat(options.cash || 0);
    
    this.setData({
      currentNetValue_raw,
      cash_raw,
      currentNetValue_display: currentNetValue_raw.toFixed(4),
      cash_display: cash_raw.toFixed(2)
    });
  },
  
  onInputAmountChange: function(e) {
    const inputAmount = e.detail.value;
    // 计算预计份额
    let estimatedUnits = '0.00';
    if (inputAmount && !isNaN(inputAmount) && this.data.currentNetValue_raw > 0) {
      estimatedUnits = (parseFloat(inputAmount) / this.data.currentNetValue_raw).toFixed(2);
    }
    
    this.setData({
      inputAmount,
      estimatedUnits: estimatedUnits,
      isBuyingAll: false // Reset flag when user manually changes input
    });
  },

  /**
   * 快捷买入操作
   * @param {Event} e 事件对象，包含仓位比例数据
   */
  onQuickBuy: function(e) {
    const ratio = parseFloat(e.currentTarget.dataset.ratio);
    const cash_raw = this.data.cash_raw;
    const currentNetValue_raw = this.data.currentNetValue_raw;
    
    if (!ratio || cash_raw <= 0 || currentNetValue_raw <= 0) {
      wx.showToast({
        title: '数据异常',
        icon: 'none'
      });
      return;
    }
    
    // 计算按比例买入的金额
    const buyAmount = cash_raw * ratio;
    const estimatedUnits = buyAmount / currentNetValue_raw;
    
    // 格式化显示金额
    const displayAmount = buyAmount.toFixed(2);
    const displayUnits = estimatedUnits.toFixed(2);
    
    this.setData({
      inputAmount: displayAmount,
      estimatedUnits: displayUnits,
      isBuyingAll: ratio >= 0.99 // 如果比例接近1，标记为全仓买入
    });
  },

  onBuyAll: function() {
    // 保留原有的全部买入功能，现在通过快捷按钮实现
    this.onQuickBuy({
      currentTarget: {
        dataset: { ratio: '1' }
      }
    });
  },
  
  onCancel: function() {
    wx.navigateBack();
  },
  
  onConfirm: function() {
    const { inputAmount, cash_raw, cash_display, isBuyingAll } = this.data;
    
    let amountToSpend;
    let isSpendingAll = false; // 是否为花光所有现金的操作
    
    // 验证输入
    const inputValue = parseFloat(inputAmount);
    if (isNaN(inputValue) || inputValue <= 0) {
      wx.showToast({
        title: '请输入有效金额',
        icon: 'none'
      });
      return;
    }
    
    // 判断是否为花光所有现金的操作
    if (isBuyingAll || inputAmount === cash_display) {
      // 情况1：点击了"全部买入"按钮
      // 情况2：手动输入的金额与可用现金显示值一致
      isSpendingAll = true;
      amountToSpend = cash_raw; // 花光所有现金时使用原始精确数值
    } else {
      // 普通买入操作
      amountToSpend = inputValue;
      
      // 检查是否有足够的现金
      if (amountToSpend > cash_raw + 0.01) { // 允许0.01元的误差范围
        wx.showToast({
          title: '现金不足',
          icon: 'none'
        });
        return;
      }
    }
    
    // 计算购买份额并返回上一页
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2]; // 获取上一个页面
    
    // 调用上一页面的方法并传递参数
    prevPage.buyConfirm(amountToSpend);
    
    // 返回上一页
    wx.navigateBack();
  }
}) 