import java.util.ArrayList;
import java.util.List;
public class lk10 {
    public static void main(String[] args) {
        String s = "cbaebabacd", p = "abc";
        List<Integer> ans = new ArrayList<>();
        int[] pcnt = new int[26], scnt = new int[26];
        int n = s.length(), m = p.length();
        if(m > n) return;

        for(int i=0;i<m;i++){
            pcnt[p.charAt(i)-'a']++;
            scnt[s.charAt(i)-'a']++;
        }
        if(check(pcnt,scnt)) ans.add(0);

        for(int i=m;i<n;i++){
            scnt[s.charAt(i-m)-'a']--;
            scnt[s.charAt(i)-'a']++;
            if(check(pcnt,scnt)) ans.add(i-m+1);
        }
        System.out.println(ans);
    }

    static boolean check(int[] a,int[] b){
        for(int i=0;i<26;i++) if(a[i]!=b[i]) return false;
        return true;
    }
}
