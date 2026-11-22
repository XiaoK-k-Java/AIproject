import java.util.HashMap;
import java.util.Map;
public class lk09 {
    public static void main(String[] args) {
        System.out.println(lengthOfLongestSubstring("abcabcbb")); // 3
        System.out.println(lengthOfLongestSubstring("bbbbb"));    // 1
        System.out.println(lengthOfLongestSubstring("pwwkew"));   // 3
    }

    static int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> last = new HashMap<>(); // 字符 -> 上次出现下标
        int left = 0, max = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (last.containsKey(c)) {
                // 左边界只能右移，不能回退
                left = Math.max(left, last.get(c) + 1);
            }
            last.put(c, right);
            max = Math.max(max, right - left + 1);
        }
        return max;
    }
}
