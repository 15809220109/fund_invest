/**
 * 游戏工具函数
 * 提供游戏相关的通用功能
 */

/**
 * 关闭游戏结果卡片 - 通用入口函数
 * 关闭分享卡片并恢复正常状�? */
function closeGameResult() {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  
  
  if (currentPage.route === 'pages/login/login') {
    // 在登录页面，关闭分享卡片
    currentPage.setData({
      showGameResult: false,
      gameEndData: null
    });
  } else if (currentPage.route === 'pages/fund/fund') {
    // 在基金页面，关闭分享卡片并恢复echarts层级
    currentPage.setData({
      showGameResult: false,
      echartsZIndex: 1
    });
  }
  
}

module.exports = {
  closeGameResult
}; 